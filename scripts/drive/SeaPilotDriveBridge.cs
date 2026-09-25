using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Security.Cryptography;
using System.Threading;
using System.Web.Script.Serialization;

// Short-lived, loopback-only transfer session started by an explicit SeaPilot action.
// No remote listener, startup service, saved login token, or arbitrary file reads.
public static class SeaPilotDriveBridge
{
    public const string Version = "2.3.0";
    public const int ConnectionPortCount = 16;
    const int MaxBody = 36 * 1024 * 1024;
    const string Api = "https://szlvyrrmvdvhzixilymh.supabase.co";
    static JavaScriptSerializer Json() { return new JavaScriptSerializer { MaxJsonLength = MaxBody, RecursionLimit = 25 }; }
    public static bool AllowedOrigin(string origin)
    {
        return origin == "https://sea-pilot-ten.vercel.app"
            || origin == "https://sea-pilot-git-codex-procedure-publishing-workflow-bbtm-app.vercel.app"
            || origin == "https://sea-pilot-git-codex-qhse-produits-chimiques-bbtm-app.vercel.app"
            || origin == "https://sea-pilot-git-codex-procedure-template-ism-bbtm-app.vercel.app"
            || origin == "http://localhost:5178" || origin == "http://localhost:5173";
    }
    static object Remote(string resource, string body, string token, string apiKey)
    {
        if (String.IsNullOrWhiteSpace(token) || String.IsNullOrWhiteSpace(apiKey) || token.Length > 12000 || apiKey.Length > 4000)
            throw new UnauthorizedAccessException("Reconnectez-vous a SeaPilot.");
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        var request = (HttpWebRequest)WebRequest.Create(Api + "/rest/v1/" + resource);
        request.AllowAutoRedirect = false; request.Timeout = 20000;
        request.Headers["Authorization"] = "Bearer " + token; request.Headers["apikey"] = apiKey;
        if (body != null)
        {
            request.Method = "POST"; request.ContentType = "application/json";
            var bytes = Encoding.UTF8.GetBytes(body); request.ContentLength = bytes.Length;
            using (var stream = request.GetRequestStream()) stream.Write(bytes, 0, bytes.Length);
        }
        using (var response = request.GetResponse()) using (var reader = new StreamReader(response.GetResponseStream()))
            return Json().DeserializeObject(reader.ReadToEnd());
    }
    public static void RequireAccess(string action, long companyId, Func<string, string, object> remote)
    {
        bool admin = action == "configure" || action == "status";
        object allowed = admin ? remote("rpc/has_role", "{\"required_role\":\"admin\"}")
            : remote("rpc/disciplinary_has_access", "{\"target_company_id\":" + companyId + "}");
        if (!(allowed is bool) || !(bool)allowed) throw new UnauthorizedAccessException("Acces SeaPilot refuse pour ce profil ou cette entreprise.");
    }
    public static string SafeName(string value)
    {
        string name = Regex.Replace((value ?? "").Normalize(), "[<>:\"/\\\\|?*\\x00-\\x1f]", "-").TrimEnd('.', ' ');
        if (name.Length > 75) name = name.Substring(0, 75).TrimEnd('.', ' ');
        if (name.Length == 0 || Regex.IsMatch(name, @"\A(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|\z)", RegexOptions.IgnoreCase)) name = "Collaborateur-" + name;
        return name;
    }
    public static string EnsureDirectory(string root, string relative)
    {
        SeaPilotDrive.ValidateParts(relative);
        string directory = root;
        foreach (string part in relative.Split('/'))
        {
            // Check each parent before creating a child: a junction cannot redirect the write.
            SeaPilotDrive.CheckWithinRoot(root, directory);
            directory = Path.Combine(directory, part);
            if (!Directory.Exists(directory)) Directory.CreateDirectory(directory);
            SeaPilotDrive.CheckWithinRoot(root, directory);
        }
        return directory;
    }
    public static string EnsurePersonFolder(string root, long company, long person, string name)
    {
        if (company <= 0 || person <= 0) throw new ArgumentException("Collaborateur invalide.");
        string suffix = " - c" + company + "-p" + person;
        string[] matches = Directory.GetDirectories(root, "*" + suffix, SearchOption.TopDirectoryOnly);
        if (matches.Length > 1) throw new IOException("Plusieurs dossiers existent pour ce collaborateur. Contactez Administration.");
        string folder = matches.Length == 1 ? Path.GetFileName(matches[0]) : SafeName(name) + suffix;
        EnsureDirectory(root, folder);
        return folder;
    }
    public static void WriteFile(string root, string relative, byte[] bytes)
    {
        SeaPilotDrive.ValidateParts(relative);
        if (!Regex.IsMatch(relative, @"\.(docx|xlsx|pptx|odt|ods|odp|txt|pdf|png|jpe?g)\z", RegexOptions.IgnoreCase)
            || bytes.Length == 0 || bytes.Length > 25 * 1024 * 1024) throw new ArgumentException("Format ou taille de fichier non autorise.");
        int slash = relative.LastIndexOf('/');
        if (slash < 0) throw new ArgumentException("Dossier du collaborateur manquant.");
        string parent = EnsureDirectory(root, relative.Substring(0, slash));
        string path = Path.Combine(parent, relative.Substring(slash + 1));
        // CreateNew refuses overwrites, including files edited in Office and existing links.
        using (var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        {
            file.Write(bytes, 0, bytes.Length); file.Flush(true);
        }
        if (new FileInfo(path).Length != bytes.Length) throw new IOException("Verification du fichier impossible.");
    }
    static long Number(Dictionary<string, object> data, string key) { return Convert.ToInt64(data[key], CultureInfo.InvariantCulture); }
    static string Text(Dictionary<string, object> data, string key) { return data.ContainsKey(key) ? Convert.ToString(data[key], CultureInfo.InvariantCulture) : ""; }
    static string PersonName(Dictionary<string, object> person) { return Text(person, "first_name") + " " + Text(person, "last_name").ToUpperInvariant(); }
    static int SyncPeople(string root, Func<string, string, object> remote)
    {
        long company = Convert.ToInt64(remote("rpc/current_planning_company_id", "{}"));
        RequireAccess("ensure-person", company, remote);
        int count = 0;
        string today = TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "Romance Standard Time").ToString("yyyy-MM-dd");
        for (int offset = 0; ; offset += 500)
        {
            var rows = remote("people?select=id,first_name,last_name&company_id=eq." + company + "&hired_on=lte." + today
                + "&or=(departed_on.is.null,departed_on.gt." + today + ")&order=id&limit=500&offset=" + offset, null) as object[];
            if (rows == null) throw new IOException("Liste des collaborateurs indisponible.");
            foreach (Dictionary<string, object> person in rows) { EnsurePersonFolder(root, company, Number(person, "id"), PersonName(person)); count++; }
            if (rows.Length < 500) return count;
        }
    }
    static object Execute(Dictionary<string, object> data, string token, string apiKey)
    {
        string action = Text(data, "action");
        if (action != "configure" && action != "status" && action != "ensure-person" && action != "write" && action != "read" && action != "publish" && action != "open") throw new ArgumentException("Action inconnue.");
        long company = data.ContainsKey("companyId") ? Number(data, "companyId") : 0;
        Func<string, string, object> remote = (resource, body) => Remote(resource, body, token, apiKey);
        if (action == "configure" || action == "status") RequireAccess(action, company, remote);
        if (action == "configure")
        {
            string root = SeaPilotDrive.ValidateRoot(Text(data, "root"));
            string disciplinary = Path.Combine(root, SeaPilotDrive.ModuleFolders["disciplinary"]);
            SeaPilotDrive.EnsureModuleDirectories(root);
            SeaPilotDrive.CheckWithinRoot(root, disciplinary);
            int count = SyncPeople(disciplinary, remote);
            SeaPilotDrive.ConfigureRoot(root);
            return new { root = root, version = Version, collaborators = count };
        }
        if (action == "status") return new { root = SeaPilotDrive.ConfiguredRoot(), version = Version };
        string baseRoot = SeaPilotDrive.ConfiguredRoot();
        if (String.IsNullOrEmpty(baseRoot)) throw new IOException("Ce PC doit etre configure dans Administration > Documents et Google Drive.");
        string module = Text(data, "module");
        if (String.IsNullOrEmpty(module)) module = "disciplinary";
        if (module == "chemicals") return ExecuteChemical(baseRoot, data, remote);
        if (module == "procedures") return SeaPilotProcedureFiles.Execute(baseRoot, data, remote, SeaPilotProcedureFiles.ExportPdf, documentPath => System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(documentPath) { UseShellExecute = true }));
        if (action == "publish" || action == "open") throw new UnauthorizedAccessException("Action non autorisee pour ce module.");
        if (action == "read") throw new UnauthorizedAccessException("Lecture non autorisee pour ce module.");
        long personId = data.ContainsKey("personId") ? Number(data, "personId") : 0;
        var scope = remote("rpc/desktop_drive_scope", Json().Serialize(new { target_module = module, target_company = company, target_person = personId })) as Dictionary<string, object>;
        if (scope == null) throw new UnauthorizedAccessException("Dossier autorise introuvable.");
        string directory = Text(scope, "directory");
        SeaPilotDrive.ValidateParts(directory);
        if (directory.Contains("/")) throw new ArgumentException("Dossier de module invalide.");
        string confidentialRoot = Path.Combine(baseRoot, directory);
        if (!Directory.Exists(confidentialRoot)) throw new IOException("Le dossier du module doit deja etre synchronise sur ce PC. Contactez Administration.");
        SeaPilotDrive.CheckWithinRoot(baseRoot, confidentialRoot);
        string folder = scope.ContainsKey("personId") ? EnsurePersonFolder(confidentialRoot, Number(scope, "companyId"), Number(scope, "personId"), Text(scope, "personName"))
            : Text(scope, "folder");
        if (String.IsNullOrEmpty(folder)) throw new UnauthorizedAccessException("Perimetre d'enregistrement manquant.");
        EnsureDirectory(confidentialRoot, folder);
        if (action == "ensure-person") return new { folder = folder };
        string path = Text(data, "path");
        if (!path.StartsWith(folder + "/", StringComparison.Ordinal)) throw new ArgumentException("Le fichier ne correspond pas au dossier du collaborateur.");
        string[] parts = path.Split('/'); DateTime day;
        if (scope.ContainsKey("personId") && (parts.Length != 3 || !DateTime.TryParseExact(parts[1], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out day))) throw new ArgumentException("Date de classement invalide.");
        byte[] bytes = Convert.FromBase64String(Text(data, "base64"));
        WriteFile(confidentialRoot, path, bytes);
        return new { path = path, bytes = bytes.Length };
    }
    // Reads only one exact file authorized by its registered attachment id, never a caller-provided directory.
    public static byte[] ReadChemicalFile(string root, string relative, string expectedHash, long expectedSize)
    {
        SeaPilotDrive.ValidateParts(relative);
        if (!Regex.IsMatch(relative, @"\.(pdf|png|jpe?g|docx|xlsx|txt)\z", RegexOptions.IgnoreCase)
            || !Regex.IsMatch(expectedHash, @"\A[a-f0-9]{64}\z") || expectedSize <= 0 || expectedSize > 20 * 1024 * 1024)
            throw new ArgumentException("Reference de fichier chimique invalide.");
        string path = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
        SeaPilotDrive.CheckWithinRoot(root, path);
        byte[] bytes;
        using (var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            SeaPilotDrive.CheckWithinRoot(root, path);
            if (file.Length != expectedSize) throw new IOException("Le fichier Drive a change ou sa synchronisation est incomplete. Ajoutez sa nouvelle version.");
            bytes = new byte[(int)file.Length]; int offset = 0;
            while (offset < bytes.Length) { int read = file.Read(bytes, offset, bytes.Length - offset); if (read == 0) throw new IOException("Fichier incomplet."); offset += read; }
        }
        using (var sha = SHA256.Create())
        {
            string hash = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
            if (hash != expectedHash) throw new IOException("Le fichier Drive a change. Ajoutez sa nouvelle version dans SeaPilot.");
        }
        return bytes;
    }
    public static object ExecuteChemical(string baseRoot, Dictionary<string, object> data, Func<string, string, object> remote)
    {
        string action = Text(data, "action"); Guid product, attachment;
        if (!Guid.TryParse(Text(data, "productId"), out product) || (action != "write" && action != "read"))
            throw new ArgumentException("Operation chimique invalide.");
        string attachmentId = null;
        if (action == "read") {
            if (!Guid.TryParse(Text(data, "attachmentId"), out attachment)) throw new ArgumentException("Piece jointe invalide.");
            attachmentId = attachment.ToString();
        }
        var scope = remote("rpc/chemical_drive_scope", Json().Serialize(new { target_product = product.ToString(), target_attachment = attachmentId })) as Dictionary<string, object>;
        if (scope == null || Text(scope, "directory") != "Produits Chimiques") throw new UnauthorizedAccessException("Acces au dossier chimique refuse.");
        string folder = Text(scope, "folder"); SeaPilotDrive.ValidateParts(folder);
        if (String.IsNullOrEmpty(folder)) throw new UnauthorizedAccessException("Dossier chimique manquant.");
        string path = Text(data, "path"); SeaPilotDrive.ValidateParts(path);
        if (!path.StartsWith(folder + "/", StringComparison.Ordinal) || path.Split('/').Length != folder.Split('/').Length + 1)
            throw new UnauthorizedAccessException("Fichier hors du dossier produit autorise.");
        string root = Path.Combine(baseRoot, "Produits Chimiques");
        if (action == "read") {
            if (Text(scope, "path") != path) throw new UnauthorizedAccessException("Seule la piece jointe demandee peut etre lue.");
            SeaPilotDrive.CheckWithinRoot(baseRoot, root);
            byte[] content = ReadChemicalFile(root, path, Text(scope, "sha256"), Number(scope, "bytes"));
            return new { path = path, bytes = content.Length, base64 = Convert.ToBase64String(content) };
        }
        byte[] bytes = Convert.FromBase64String(Text(data, "base64"));
        if (bytes.Length > 20 * 1024 * 1024 || !Regex.IsMatch(path, @"\.(pdf|png|jpe?g|docx|xlsx|txt)\z", RegexOptions.IgnoreCase))
            throw new ArgumentException("Formats acceptes : PDF, PNG, JPEG, DOCX, XLSX et TXT, 20 Mo maximum.");
        EnsureDirectory(baseRoot, "Produits Chimiques");
        WriteFile(root, path, bytes);
        return new { path = path, bytes = bytes.Length };
    }

    static string ReadHeaders(NetworkStream stream)
    {
        var bytes = new List<byte>();
        while (bytes.Count < 16384)
        {
            int value = stream.ReadByte(); if (value < 0) throw new IOException("Requete incomplete.");
            bytes.Add((byte)value);
            int n = bytes.Count;
            if (n >= 4 && bytes[n-4] == 13 && bytes[n-3] == 10 && bytes[n-2] == 13 && bytes[n-1] == 10) return Encoding.ASCII.GetString(bytes.ToArray());
        }
        throw new IOException("Requete trop longue.");
    }
    static void Respond(NetworkStream stream, int code, string origin, object data)
    {
        byte[] body = Encoding.UTF8.GetBytes(Json().Serialize(data));
        string cors = AllowedOrigin(origin) ? "Access-Control-Allow-Origin: " + origin + "\r\nVary: Origin\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: content-type, authorization, x-seapilot-key\r\nAccess-Control-Allow-Private-Network: true\r\n" : "";
        byte[] headers = Encoding.ASCII.GetBytes("HTTP/1.1 " + code + " SeaPilot\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\n" + cors + "Content-Length: " + body.Length + "\r\n\r\n");
        stream.Write(headers, 0, headers.Length); stream.Write(body, 0, body.Length);
    }
    static void Handle(TcpClient client, int port, string nonce)
    {
        using (client) using (var stream = client.GetStream())
        {
            stream.ReadTimeout = 10000; stream.WriteTimeout = 10000;
            string origin = "";
            try
            {
                string[] lines = ReadHeaders(stream).Split(new[] { "\r\n" }, StringSplitOptions.None);
                var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                for (int i = 1; i < lines.Length && lines[i].Length > 0; i++)
                {
                    int colon = lines[i].IndexOf(':');
                    if (colon < 1) throw new ArgumentException("Entete invalide.");
                    headers.Add(lines[i].Substring(0, colon), lines[i].Substring(colon + 1).Trim());
                }
                if (headers.ContainsKey("Origin")) origin = headers["Origin"];
                string[] request = lines[0].Split(' ');
                if (!AllowedOrigin(origin) || !headers.ContainsKey("Host") || headers["Host"] != "127.0.0.1:" + port
                    || request.Length != 3 || request[2] != "HTTP/1.1" || (request[1] != "/" + nonce + "/health" && request[1] != "/" + nonce + "/request"))
                    throw new UnauthorizedAccessException("Origine ou session locale refusee.");
                if (request[0] == "OPTIONS") { Respond(stream, 200, origin, new { ok = true }); return; }
                if (request[0] == "GET" && request[1].EndsWith("/health")) { Respond(stream, 200, origin, new { version = Version, nonce = nonce }); return; }
                int length;
                if (request[0] != "POST" || !request[1].EndsWith("/request") || headers.ContainsKey("Transfer-Encoding")
                    || !headers.ContainsKey("Content-Length") || !Int32.TryParse(headers["Content-Length"], out length) || length <= 0 || length > MaxBody
                    || !headers.ContainsKey("Content-Type") || !headers["Content-Type"].StartsWith("application/json", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Requete invalide.");
                if (!headers.ContainsKey("Authorization") || !headers["Authorization"].StartsWith("Bearer ", StringComparison.Ordinal)
                    || !headers.ContainsKey("X-SeaPilot-Key")) throw new UnauthorizedAccessException("Session SeaPilot requise.");
                byte[] body = new byte[length]; int offset = 0;
                while (offset < length) { int read = stream.Read(body, offset, length - offset); if (read == 0) throw new IOException("Transfert incomplet."); offset += read; }
                var data = Json().Deserialize<Dictionary<string, object>>(new UTF8Encoding(false, true).GetString(body));
                Respond(stream, 200, origin, Execute(data, headers["Authorization"].Substring(7), headers["X-SeaPilot-Key"]));
            }
            catch (Exception error)
            {
                // Never return remote response bodies, bearer tokens, or stack traces.
                string message = error is WebException ? "Verification des droits SeaPilot impossible. Verifiez votre connexion et reconnectez-vous." : error.Message;
                try { Respond(stream, error is UnauthorizedAccessException ? 403 : 400, origin, new { error = message }); } catch (IOException) { }
            }
        }
    }
    // Spread candidates across the dynamic range: Windows often excludes entire
    // consecutive ranges. Keep this sequence in sync with localDriveLauncher.ts.
    public static int ConnectionPort(int firstPort, int attempt)
    {
        if (firstPort < 49152 || firstPort > 65535 || attempt < 0 || attempt >= ConnectionPortCount)
            throw new ArgumentException("Port de connexion locale invalide.");
        return 49152 + (firstPort - 49152 + attempt * 1019) % 16384;
    }
    public static TcpListener StartListener(int firstPort)
    {
        for (int attempt = 0; attempt < ConnectionPortCount; attempt++)
        {
            var listener = new TcpListener(IPAddress.Loopback, ConnectionPort(firstPort, attempt));
            listener.ExclusiveAddressUse = true;
            try { listener.Start(8); return listener; }
            catch (SocketException error)
            {
                listener.Stop();
                if (error.SocketErrorCode != SocketError.AccessDenied && error.SocketErrorCode != SocketError.AddressAlreadyInUse) throw;
            }
        }
        throw new IOException("Windows bloque les ports de connexion locale de SeaPilot. Votre dossier Drive reste configure. Contactez votre assistance informatique pour autoriser le lanceur SeaPilot.");
    }
    public static void Serve(int port, string nonce)
    {
        if (port < 49152 || port > 65535 || !Regex.IsMatch(nonce, @"\A[a-f0-9]{32}\z")) throw new ArgumentException("Session locale invalide.");
        var listener = StartListener(port);
        port = ((IPEndPoint)listener.LocalEndpoint).Port;
        try
        {
            DateTime until = DateTime.UtcNow.AddMinutes(3);
            int requests = 0;
            while (DateTime.UtcNow < until && requests < 128)
            {
                if (!listener.Pending()) { Thread.Sleep(75); continue; }
                Handle(listener.AcceptTcpClient(), port, nonce); requests++;
            }
        }
        finally { listener.Stop(); }
    }
}

// The RPC resolves every read/open/export to a registered document for the real
// signed-in profile. No client-supplied path can grant access to a source file.
public static class SeaPilotProcedureFiles
{
    const int Limit = 25 * 1024 * 1024;
    static string Text(Dictionary<string, object> data, string key) { return data.ContainsKey(key) ? Convert.ToString(data[key], CultureInfo.InvariantCulture) : ""; }
    static long Id(Dictionary<string, object> data, string key) { return data.ContainsKey(key) ? Convert.ToInt64(data[key], CultureInfo.InvariantCulture) : 0; }
    public static string Hash(byte[] bytes) { using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
    static bool Pdf(byte[] bytes) { return bytes.Length >= 5 && Encoding.ASCII.GetString(bytes, 0, 5) == "%PDF-"; }
    static void Validate(string path, bool pdfOnly)
    {
        SeaPilotDrive.ValidateParts(path);
        if (!Regex.IsMatch(path, pdfOnly ? @"\.pdf\z" : @"\.(docx?|xlsx?|pptx?|odt|ods|odp|txt|pdf)\z", RegexOptions.IgnoreCase)) throw new ArgumentException("Format de procedure non autorise.");
    }
    public static byte[] Read(string root, string relative)
    {
        Validate(relative, false);
        string path = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
        SeaPilotDrive.CheckWithinRoot(root, path);
        using (var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)) {
            SeaPilotDrive.CheckWithinRoot(root, path);
            if (file.Length <= 0 || file.Length > Limit) throw new IOException("La procedure doit peser entre 1 octet et 25 Mo.");
            byte[] bytes = new byte[(int)file.Length]; int offset = 0;
            while (offset < bytes.Length) { int n = file.Read(bytes, offset, bytes.Length - offset); if (n == 0) throw new IOException("Fichier incomplet."); offset += n; }
            return bytes;
        }
    }
    // An identical retry is safe after a lost acknowledgement; a different file
    // with the same name must never silently replace an Office working document.
    public static void Write(string root, string name, byte[] bytes)
    {
        Validate(name, false);
        if (name.Contains("/") || bytes.Length <= 0 || bytes.Length > Limit) throw new ArgumentException("Nom ou taille de procedure invalide.");
        SeaPilotDrive.CheckWithinRoot(root, root);
        string path = Path.Combine(root, name);
        if (File.Exists(path)) {
            if (Hash(Read(root, name)) == Hash(bytes)) return;
            throw new IOException("Un fichier de ce nom existe deja. Modifiez la version ou le numero ; le fichier existant est conserve.");
        }
        using (var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { file.Write(bytes, 0, bytes.Length); file.Flush(true); }
        if (Hash(Read(root, name)) != Hash(bytes)) throw new IOException("Verification de la copie impossible.");
    }
    public static object Execute(string baseRoot, Dictionary<string, object> data, Func<string, string, object> remote,
        Func<string, byte[]> exportPdf, Action<string> open)
    {
        string action = Text(data, "action");
        if (action != "write" && action != "read" && action != "open" && action != "publish") throw new ArgumentException("Action de procedure inconnue.");
        var json = new JavaScriptSerializer();
        var scope = remote("rpc/procedure_drive_scope", json.Serialize(new { target_action = action, target_procedure = Id(data, "procedureId"), target_publication = Id(data, "publicationId") })) as Dictionary<string, object>;
        if (scope == null) throw new UnauthorizedAccessException("Acces a la procedure refuse.");
        string directory = Text(scope, "directory");
        if (directory != "Procedures" && !(directory == "Procedures PDF" && action == "read")) throw new UnauthorizedAccessException("Dossier de procedure refuse.");
        string root = Path.Combine(baseRoot, directory);
        if (action == "write") {
            string name = Text(data, "path"); Validate(name, false);
            byte[] bytes = Convert.FromBase64String(Text(data, "base64"));
            SeaPilotDriveBridge.EnsureDirectory(baseRoot, directory);
            Write(root, name, bytes);
            return new { path = name, bytes = bytes.Length, sha256 = Hash(bytes) };
        }
        SeaPilotDrive.CheckWithinRoot(baseRoot, root);
        string relative = Text(scope, "path"); Validate(relative, directory == "Procedures PDF");
        string fullPath = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
        SeaPilotDrive.CheckWithinRoot(root, fullPath);
        if (action == "open") { open(fullPath); return new { opened = true }; }
        if (action == "publish") {
            string name = Text(scope, "pdfName"); Validate(name, true);
            string pdfRoot = SeaPilotDriveBridge.EnsureDirectory(baseRoot, "Procedures PDF");
            string sourceHash = Hash(Read(root, relative));
            // Keep the receipt on this PC so a lost database acknowledgement can
            // be retried without re-exporting Office's changing PDF timestamps.
            string cacheRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SeaPilotDrive", "PublicationReceipts");
            Directory.CreateDirectory(cacheRoot);
            string cachePath = Path.Combine(cacheRoot, Hash(Encoding.UTF8.GetBytes(fullPath.ToLowerInvariant() + "\n" + name.ToLowerInvariant())) + ".json");
            if (File.Exists(cachePath) && new FileInfo(cachePath).Length < 4096 && File.Exists(Path.Combine(pdfRoot, name))) {
                Dictionary<string, object> cached = null;
                try { cached = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(cachePath)); } catch (ArgumentException) { }
                if (cached != null && Text(cached, "sourceHash") == sourceHash) {
                    byte[] previousPdf = Read(pdfRoot, name);
                    if (Pdf(previousPdf) && Hash(previousPdf) == Text(cached, "pdfHash"))
                        return new { path = name, bytes = previousPdf.Length, sha256 = Hash(previousPdf) };
                }
            }
            byte[] pdf = exportPdf(fullPath);
            if (!Pdf(pdf) || pdf.Length > Limit) throw new IOException("Le fichier converti n'est pas un PDF valide de moins de 25 Mo.");
            if (Hash(Read(root, relative)) != sourceHash) throw new IOException("Le document a ete modifie pendant la conversion. Enregistrez-le puis relancez la publication.");
            Write(pdfRoot, name, pdf);
            File.WriteAllText(cachePath, json.Serialize(new { sourceHash = sourceHash, pdfHash = Hash(pdf) }));
            return new { path = name, bytes = pdf.Length, sha256 = Hash(pdf) };
        }
        byte[] content = Read(root, relative);
        string hash = Hash(content);
        if (directory == "Procedures PDF" && (!Pdf(content) || Text(scope, "sha256") != hash || Id(scope, "bytes") != content.Length))
            throw new IOException("Le PDF a change depuis sa publication. Contactez Administration.");
        return new { path = relative, bytes = content.Length, sha256 = hash, base64 = Convert.ToBase64String(content) };
    }
    public static byte[] ExportPdf(string source)
    {
        byte[] savedSource = Read(Path.GetDirectoryName(source), Path.GetFileName(source));
        if (String.Equals(Path.GetExtension(source), ".pdf", StringComparison.OrdinalIgnoreCase)) return savedSource;
        // Export a saved snapshot. The worker gets its own Office instance and is
        // bounded in time; the launcher never closes the user's working document.
        string temp = Path.Combine(Path.GetTempPath(), "seapilot-pdf-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(temp);
        string snapshot = Path.Combine(temp, "source" + Path.GetExtension(source));
        string pdf = Path.Combine(temp, "publication.pdf");
        try {
            File.WriteAllBytes(snapshot, savedSource);
            string exe = System.Reflection.Assembly.GetExecutingAssembly().Location;
            var start = new System.Diagnostics.ProcessStartInfo(exe, "--procedure-pdf-worker \"" + snapshot + "\" \"" + pdf + "\"") { UseShellExecute = false, CreateNoWindow = true, WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden };
            using (var process = System.Diagnostics.Process.Start(start)) {
                if (!process.WaitForExit(60000)) { process.Kill(); throw new IOException("La conversion a depasse une minute. Fermez les dialogues Office puis reessayez."); }
                if (process.ExitCode != 0 || !File.Exists(pdf)) throw new IOException("Conversion PDF impossible. Verifiez que Word, Excel ou PowerPoint est installe et que le document est enregistre sans mot de passe.");
            }
            return Read(temp, "publication.pdf");
        } finally {
            // Delete only the known files in our uniquely allocated temp folder.
            foreach (string file in new[] { snapshot, pdf }) { try { if (File.Exists(file)) File.Delete(file); } catch (IOException) { } }
            try { Directory.Delete(temp, false); } catch (IOException) { }
        }
    }
    static object Call(object instance, string member, params object[] args) { return instance.GetType().InvokeMember(member, System.Reflection.BindingFlags.InvokeMethod | System.Reflection.BindingFlags.OptionalParamBinding, null, instance, args, CultureInfo.InvariantCulture); }
    static object Get(object instance, string member) { return instance.GetType().InvokeMember(member, System.Reflection.BindingFlags.GetProperty, null, instance, null, CultureInfo.InvariantCulture); }
    static void Set(object instance, string member, object value) { instance.GetType().InvokeMember(member, System.Reflection.BindingFlags.SetProperty, null, instance, new[] { value }, CultureInfo.InvariantCulture); }
    static void Release(object value) { if (value != null && System.Runtime.InteropServices.Marshal.IsComObject(value)) System.Runtime.InteropServices.Marshal.FinalReleaseComObject(value); }
    public static void ConvertOfficeToPdf(string source, string pdf)
    {
        string ext = Path.GetExtension(source).ToLowerInvariant();
        bool excel = Regex.IsMatch(ext, @"\A\.(xlsx?|ods)\z"), ppt = Regex.IsMatch(ext, @"\A\.(pptx?|odp)\z");
        if (!excel && !ppt && !Regex.IsMatch(ext, @"\A\.(docx?|odt|txt)\z")) throw new ArgumentException("Format Office non pris en charge.");
        object app = null, documents = null, document = null, oldSecurity = null, oldAlerts = null;
        try {
            Type type = Type.GetTypeFromProgID(excel ? "Excel.Application" : ppt ? "PowerPoint.Application" : "Word.Application", true);
            app = Activator.CreateInstance(type);
            oldSecurity = Get(app, "AutomationSecurity"); oldAlerts = Get(app, "DisplayAlerts");
            Set(app, "AutomationSecurity", 3); // msoAutomationSecurityForceDisable
            Set(app, "DisplayAlerts", ppt ? 1 : 0);
            if (!ppt) Set(app, "Visible", false);
            if (excel) { Set(app, "EnableEvents", false); Set(app, "AskToUpdateLinks", false); }
            documents = Get(app, excel ? "Workbooks" : ppt ? "Presentations" : "Documents");
            document = excel ? Call(documents, "Open", source, 0, true)
                : ppt ? Call(documents, "Open", source, -1, 0, 0)
                : Call(documents, "Open", source, false, true, false);
            if (ppt) Call(document, "SaveAs", pdf, 32);
            else if (excel) Call(document, "ExportAsFixedFormat", 0, pdf);
            else Call(document, "ExportAsFixedFormat", pdf, 17);
        } finally {
            if (document != null) { try { if (ppt) Call(document, "Close"); else Call(document, "Close", false); } catch { } Release(document); }
            if (app != null) { try { if (oldSecurity != null) Set(app, "AutomationSecurity", oldSecurity); if (oldAlerts != null) Set(app, "DisplayAlerts", oldAlerts); } catch { } }
            if (app != null) { try { if (documents == null || Convert.ToInt32(Get(documents, "Count")) == 0) Call(app, "Quit"); } catch { } }
            Release(documents); Release(app);
        }
    }
}
