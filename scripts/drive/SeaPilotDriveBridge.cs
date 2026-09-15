using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

// Short-lived, loopback-only transfer session started by an explicit SeaPilot action.
// No remote listener, startup service, saved login token, or arbitrary file reads.
public static class SeaPilotDriveBridge
{
    public const string Version = "2.0.0";
    const int MaxBody = 36 * 1024 * 1024;
    const string Api = "https://szlvyrrmvdvhzixilymh.supabase.co";
    static JavaScriptSerializer Json() { return new JavaScriptSerializer { MaxJsonLength = MaxBody, RecursionLimit = 25 }; }
    public static bool AllowedOrigin(string origin)
    {
        return origin == "https://sea-pilot-ten.vercel.app"
            || origin == "https://sea-pilot-git-codex-procedure-publishing-workflow-bbtm-app.vercel.app"
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
        if (action != "configure" && action != "status" && action != "ensure-person" && action != "write") throw new ArgumentException("Action inconnue.");
        long company = data.ContainsKey("companyId") ? Number(data, "companyId") : 0;
        Func<string, string, object> remote = (resource, body) => Remote(resource, body, token, apiKey);
        if (action == "configure" || action == "status") RequireAccess(action, company, remote);
        if (action == "configure")
        {
            string root = SeaPilotDrive.ValidateRoot(Text(data, "root"));
            string disciplinary = Path.Combine(root, SeaPilotDrive.ModuleFolders["disciplinary"]);
            if (!Directory.Exists(disciplinary)) throw new IOException("Le dossier confidentiel Sanctions Disciplinaires doit deja etre partage avec les comptes autorises et synchronise dans SeaPilot.");
            SeaPilotDrive.CheckWithinRoot(root, disciplinary);
            EnsureDirectory(root, "Procedures");
            int count = SyncPeople(disciplinary, remote);
            SeaPilotDrive.ConfigureRoot(root);
            return new { root = root, version = Version, collaborators = count };
        }
        if (action == "status") return new { root = SeaPilotDrive.ConfiguredRoot(), version = Version };
        string baseRoot = SeaPilotDrive.ConfiguredRoot();
        if (String.IsNullOrEmpty(baseRoot)) throw new IOException("Ce PC doit etre configure dans Administration > Documents et Google Drive.");
        string module = Text(data, "module");
        if (String.IsNullOrEmpty(module)) module = "disciplinary";
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
                if (request[0] == "GET" && request[1].EndsWith("/health")) { Respond(stream, 200, origin, new { version = Version }); return; }
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
    public static void Serve(int port, string nonce)
    {
        if (port < 49152 || port > 65535 || !Regex.IsMatch(nonce, @"\A[a-f0-9]{32}\z")) throw new ArgumentException("Session locale invalide.");
        var listener = new TcpListener(IPAddress.Loopback, port);
        listener.ExclusiveAddressUse = true; listener.Start(8);
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
