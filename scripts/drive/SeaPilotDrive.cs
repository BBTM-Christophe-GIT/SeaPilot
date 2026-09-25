using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

public static class SeaPilotDrive
{
    const string SettingsKey = @"Software\SeaPilot\Drive";
    // Known legacy routes. New modules use root/open and need no launcher update.
    public static readonly Dictionary<string, string> ModuleFolders = new Dictionary<string, string> {
        { "procedures", "Procedures" }, { "procedurePdfs", "Procedures PDF" },
        { "disciplinary", "Sanctions Disciplinaires" }, { "chemicals", "Produits Chimiques" }, { "humanResources", "Ressources Humaines" }
    };

    public static string ConfiguredRoot()
    {
        using (var key = Registry.CurrentUser.OpenSubKey(SettingsKey))
            return key == null ? null : key.GetValue("SeaPilotRoot") as string;
    }
    public static string ValidateRoot(string root)
    {
        if (String.IsNullOrWhiteSpace(root) || !Regex.IsMatch(root, @"\A[A-Za-z]:\\") || !Directory.Exists(root))
            throw new IOException("Indiquez le chemin local du dossier SeaPilot synchronise sur ce PC.");
        string full = Path.GetFullPath(root).TrimEnd('\\');
        if (!String.Equals(Path.GetFileName(full), "SeaPilot", StringComparison.OrdinalIgnoreCase))
            throw new IOException("Selectionnez le dossier SeaPilot, pas un sous-dossier de module.");
        return full;
    }
    public static string ConfigureRoot(string root)
    {
        string full = ValidateRoot(root);
        EnsureModuleDirectories(full);
        using (var key = Registry.CurrentUser.CreateSubKey(SettingsKey)) key.SetValue("SeaPilotRoot", full);
        return full;
    }
    public static void EnsureModuleDirectories(string root)
    {
        foreach (string directory in ModuleFolders.Values) SeaPilotDriveBridge.EnsureDirectory(root, directory);
    }
    public static string ModuleRoot(string module)
    {
        if (!ModuleFolders.ContainsKey(module)) throw new ArgumentException("Module SeaPilot inconnu. Mettez le lanceur a jour depuis Administration.");
        string root = ConfiguredRoot();
        if (!String.IsNullOrEmpty(root)) return Path.Combine(root, ModuleFolders[module]);
        // Existing documents and old installations remain usable during the upgrade.
        using (var key = Registry.CurrentUser.OpenSubKey(SettingsKey)) return key == null ? null : key.GetValue(module == "disciplinary" ? "DisciplinaryRoot" : "Root") as string;
    }
    public static void ValidateParts(string relative)
    {
        if (String.IsNullOrEmpty(relative) || relative.Length > 500 || relative.Contains("\\")) throw new ArgumentException("Chemin de fichier non autorise.");
        foreach (string part in relative.Split('/'))
            if (part.Length == 0 || part == "." || part == ".." || Regex.IsMatch(part, "[<>:\"|?*\\x00-\\x1f]")
                || Regex.IsMatch(part, @"[. ]\z") || Regex.IsMatch(part, @"\A(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|\z)", RegexOptions.IgnoreCase))
                throw new ArgumentException("Chemin de fichier non autorise.");
    }
    public static void CheckWithinRoot(string root, string path)
    {
        string actualRoot = FinalPath(root), actualPath = FinalPath(path);
        if (!String.Equals(actualPath, actualRoot, StringComparison.OrdinalIgnoreCase) && !actualPath.StartsWith(actualRoot + "\\", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Le chemin pointe hors du dossier SeaPilot.");
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security,
        uint creation, uint flags, IntPtr template);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path, uint size, uint flags);

    static string FinalPath(string path)
    {
        // Follow links and hydrate Drive placeholders before checking the actual destination.
        using (var handle = CreateFile(path, 0, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero))
        {
            if (handle.IsInvalid) throw new IOException("Fichier inaccessible. Verifiez la synchronisation Google Drive.");
            var buffer = new StringBuilder(32768);
            uint size = GetFinalPathNameByHandle(handle, buffer, (uint)buffer.Capacity, 0);
            if (size == 0 || size >= buffer.Capacity) throw new IOException("Le chemin du fichier ne peut pas etre verifie.");
            return buffer.ToString().TrimEnd('\\');
        }
    }

    public static string ResolvePath(string root, string launchUri)
    {
        if (String.IsNullOrWhiteSpace(root) || !Path.IsPathRooted(root) || !Directory.Exists(root))
            throw new IOException("Configurez le dossier Google Drive synchronise dans SeaPilot.");
        bool rootScope = launchUri != null && launchUri.StartsWith("seapilot-drive://root/open/", StringComparison.Ordinal);
        bool disciplinary = launchUri != null && launchUri.StartsWith("seapilot-drive://disciplinary/open/", StringComparison.Ordinal);
        string prefix = rootScope ? "seapilot-drive://root/open/" : disciplinary ? "seapilot-drive://disciplinary/open/" : "seapilot-drive://open/";
        if (launchUri == null || !launchUri.StartsWith(prefix, StringComparison.Ordinal) || launchUri.Length > 2100)
            throw new ArgumentException("Lien SeaPilot invalide.");
        string payload = launchUri.Substring(prefix.Length);
        if (!Regex.IsMatch(payload, @"\A[A-Za-z0-9_-]+\z")) throw new ArgumentException("Lien SeaPilot invalide.");
        payload = payload.Replace('-', '+').Replace('_', '/');
        payload = payload.PadRight((payload.Length + 3) / 4 * 4, '=');
        string relative = new UTF8Encoding(false, true).GetString(Convert.FromBase64String(payload));
        if (relative.Length == 0 || relative.Length > 500 || relative.Contains("\\")
            || !Regex.IsMatch(relative, disciplinary || rootScope ? @"\.(docx?|xlsx?|pptx?|odt|ods|odp|txt|pdf|png|jpe?g)\z" : @"\.(docx?|xlsx?|pptx?|odt|ods|odp|txt)\z", RegexOptions.IgnoreCase))
            throw new ArgumentException("Format de fichier non autorise.");
        ValidateParts(relative);
        string fullRoot = Path.GetFullPath(root).TrimEnd('\\') + "\\";
        string fullPath = Path.GetFullPath(Path.Combine(fullRoot, relative.Replace('/', '\\')));
        if (!fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Fichier hors du dossier SeaPilot.");
        if (!File.Exists(fullPath))
            throw new FileNotFoundException("Fichier absent du dossier synchronise. Verifiez le nom, le chemin et le compte Google Drive.");
        if (!FinalPath(fullPath).StartsWith(FinalPath(fullRoot) + "\\", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Le fichier pointe hors du dossier SeaPilot.");
        return fullPath;
    }

    static void Configure()
    {
        using (var dialog = new FolderBrowserDialog())
        {
            dialog.Description = "Selectionnez le dossier SeaPilot synchronise. Il sera utilise pour tous les modules.";
            dialog.ShowNewFolderButton = false;
            if (dialog.ShowDialog() != DialogResult.OK) return;
            ConfigureRoot(dialog.SelectedPath);
            MessageBox.Show("Dossier SeaPilot configure :\n" + dialog.SelectedPath, "SeaPilot Drive");
        }
    }

    [STAThread]
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 3 && args[0] == "--procedure-pdf-worker") {
                SeaPilotProcedureFiles.ConvertOfficeToPdf(args[1], args[2]); return 0;
            }
            if (args.Length != 1) throw new ArgumentException("Un seul lien SeaPilot est attendu.");
            if (args[0] == "seapilot-drive://initialize") { EnsureModuleDirectories(ValidateRoot(ConfiguredRoot())); return 0; }
            var connection = Regex.Match(args[0], @"\Aseapilot-drive://connect/(\d{5})/([a-f0-9]{32})/?\z");
            if (connection.Success) { SeaPilotDriveBridge.Serve(Int32.Parse(connection.Groups[1].Value), connection.Groups[2].Value); return 0; }
            if (args[0] == "seapilot-drive://configure" || args[0] == "seapilot-drive://configure/")
            {
                Configure();
                return 0;
            }
            if (args[0] == "seapilot-drive://disciplinary/configure" || args[0] == "seapilot-drive://disciplinary/configure/")
            {
                Configure();
                return 0;
            }
            string module = args[0].StartsWith("seapilot-drive://disciplinary/open/", StringComparison.Ordinal) ? "disciplinary" : "procedures";
            string launch = args[0];
            var generic = Regex.Match(launch, @"\Aseapilot-drive://modules/([a-zA-Z]+)/open/([A-Za-z0-9_-]+)\z");
            if (generic.Success) {
                module = generic.Groups[1].Value;
                if (!ModuleFolders.ContainsKey(module)) throw new ArgumentException("Module SeaPilot inconnu.");
                launch = (module == "disciplinary" ? "seapilot-drive://disciplinary/open/" : "seapilot-drive://open/") + generic.Groups[2].Value;
            }
            string path = ResolvePath(launch.StartsWith("seapilot-drive://root/open/", StringComparison.Ordinal) ? ConfiguredRoot() : ModuleRoot(module), launch);
            // Pass the verified filename directly to Windows, never to cmd or PowerShell.
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
            return 0;
        }
        catch (Exception error)
        {
            if (args.Length == 3 && args[0] == "--procedure-pdf-worker") return 1;
            MessageBox.Show(error.Message, "SeaPilot Drive", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }
    }
}
