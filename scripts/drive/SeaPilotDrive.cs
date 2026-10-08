using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

public static class SeaPilotDrive
{
    public const string DefaultRoot = @"G:\Mon Drive\SeaPilot";
    const string SettingsKey = @"Software\SeaPilot\Drive";
    // Known legacy routes. New modules use root/open and need no launcher update.
    public static readonly Dictionary<string, string> ModuleFolders = new Dictionary<string, string> {
        { "procedures", "Procedures" }, { "procedurePdfs", "Procedures PDF" },
        { "disciplinary", "Sanctions Disciplinaires" }, { "chemicals", "Produits Chimiques" }, { "humanResources", "Ressources Humaines" }, { "projects", "Projet" }
    };

    public static string ConfiguredRoot()
    {
        using (var key = Registry.CurrentUser.OpenSubKey(SettingsKey))
            return key == null ? null : key.GetValue("SeaPilotRoot") as string;
    }
    public static string ValidateRoot(string root)
    {
        string full = ResolveDirectoryPath(root, new HashSet<string>(StringComparer.OrdinalIgnoreCase));
        string selectedName = Path.GetFileName(root.TrimEnd('\\'));
        if (selectedName.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)) selectedName = Path.GetFileNameWithoutExtension(selectedName);
        if (!String.Equals(selectedName, "SeaPilot", StringComparison.OrdinalIgnoreCase)
            || !String.Equals(Path.GetFileName(full), "SeaPilot", StringComparison.OrdinalIgnoreCase))
            throw new IOException("Selectionnez le dossier SeaPilot, pas un sous-dossier de module.");
        return full;
    }
    static string ShortcutTarget(string shortcut)
    {
        // Read an existing Shell link only. Never launch it or interpret its arguments.
        object shell = null, link = null;
        try
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            shell = Activator.CreateInstance(shellType);
            link = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcut });
            Type linkType = link.GetType();
            string target = Convert.ToString(linkType.InvokeMember("TargetPath", BindingFlags.GetProperty, null, link, null));
            string arguments = Convert.ToString(linkType.InvokeMember("Arguments", BindingFlags.GetProperty, null, link, null));
            if (!String.IsNullOrWhiteSpace(arguments) || String.IsNullOrWhiteSpace(target) || !Regex.IsMatch(target, @"\A[A-Za-z]:\\"))
                throw new IOException("Le raccourci doit pointer directement vers un dossier local Google Drive.");
            return target;
        }
        catch (Exception error)
        {
            throw new IOException("Raccourci Google Drive inaccessible ou invalide. Verifiez le compte Drive et son acces au dossier SeaPilot.", error);
        }
        finally
        {
            if (link != null && Marshal.IsComObject(link)) Marshal.FinalReleaseComObject(link);
            if (shell != null && Marshal.IsComObject(shell)) Marshal.FinalReleaseComObject(shell);
        }
    }
    static string ResolveDirectoryPath(string path, HashSet<string> shortcuts)
    {
        if (String.IsNullOrWhiteSpace(path) || path.Length > 32767 || !Regex.IsMatch(path, @"\A[A-Za-z]:\\"))
            throw new IOException("Indiquez le dossier local SeaPilot ou son raccourci Google Drive sur ce PC.");
        string full;
        try { full = Path.GetFullPath(path).TrimEnd('\\'); }
        catch (ArgumentException error) { throw new IOException("Chemin Google Drive invalide.", error); }
        string current = Path.GetPathRoot(full);
        foreach (string part in full.Substring(current.Length).Split('\\'))
        {
            string candidate = Path.Combine(current, part);
            if (Directory.Exists(candidate)) { current = candidate; continue; }
            string shortcut = candidate.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase) ? candidate : candidate + ".lnk";
            if (!File.Exists(shortcut)) throw new IOException("Dossier SeaPilot inaccessible. Ajoutez son raccourci dans Mon Drive et attendez la synchronisation Google Drive.");
            if (shortcuts.Count >= 32 || !shortcuts.Add(shortcut)) throw new IOException("Le raccourci Google Drive contient une boucle.");
            // A parent such as Mon Drive can itself be a Shell link in mirrored mode.
            current = ResolveDirectoryPath(ShortcutTarget(shortcut), shortcuts);
        }
        if (!Directory.Exists(current)) throw new IOException("La cible du raccourci Google Drive est absente ou inaccessible.");
        return current.TrimEnd('\\');
    }
    public static string ConfigureRoot(string root)
    {
        string full = ValidateRoot(root);
        EnsureModuleDirectories(full);
        using (var key = Registry.CurrentUser.CreateSubKey(SettingsKey)) key.SetValue("SeaPilotRoot", full);
        return full;
    }
    public static string DetectRoot(string configured, string fallback)
    {
        foreach (string candidate in new[] { configured, fallback })
        {
            try { return ValidateRoot(candidate); }
            catch (IOException) { }
        }
        return null;
    }
    public static string SelectRoot(string initial)
    {
        using (var choice = new Form())
        {
            choice.Text = "Dossier SeaPilot sur ce PC";
            choice.Width = 560; choice.Height = 190;
            choice.FormBorderStyle = FormBorderStyle.FixedDialog;
            choice.StartPosition = FormStartPosition.CenterScreen;
            choice.MinimizeBox = false; choice.MaximizeBox = false;
            var explanation = new Label { Left = 20, Top = 18, Width = 500, Height = 45,
                Text = "Selectionnez SeaPilot dans Google Drive. Si Windows affiche un raccourci, choisissez le fichier SeaPilot.lnk." };
            var folder = new Button { Left = 20, Top = 82, Width = 165, Height = 30, Text = "Choisir un dossier" };
            var shortcut = new Button { Left = 195, Top = 82, Width = 205, Height = 30, Text = "Choisir un raccourci (.lnk)" };
            var cancel = new Button { Left = 410, Top = 82, Width = 110, Height = 30, Text = "Annuler", DialogResult = DialogResult.Cancel };
            string selection = null;
            folder.Click += (sender, args) => {
                using (var dialog = new FolderBrowserDialog()) {
                    dialog.Description = "Selectionnez le dossier SeaPilot synchronise avec Google Drive.";
                    dialog.ShowNewFolderButton = false;
                    if (Directory.Exists(initial)) dialog.SelectedPath = initial;
                    if (dialog.ShowDialog(choice) == DialogResult.OK) { selection = dialog.SelectedPath; choice.DialogResult = DialogResult.OK; }
                }
            };
            shortcut.Click += (sender, args) => {
                using (var dialog = new OpenFileDialog()) {
                    dialog.Title = "Selectionnez le raccourci du dossier SeaPilot";
                    dialog.Filter = "Raccourcis Windows (*.lnk)|*.lnk";
                    dialog.DereferenceLinks = false; dialog.CheckFileExists = true;
                    string parent = Path.GetDirectoryName(initial);
                    if (Directory.Exists(parent)) dialog.InitialDirectory = parent;
                    if (dialog.ShowDialog(choice) == DialogResult.OK) { selection = dialog.FileName; choice.DialogResult = DialogResult.OK; }
                }
            };
            choice.Controls.AddRange(new Control[] { explanation, folder, shortcut, cancel });
            choice.AcceptButton = folder; choice.CancelButton = cancel;
            return choice.ShowDialog() == DialogResult.OK ? selection : null;
        }
    }
    public static void EnsureModuleDirectories(string root)
    {
        foreach (string directory in ModuleFolders.Values) SeaPilotDriveBridge.EnsureDirectory(root, directory);
    }
    public static string ModuleRoot(string module)
    {
        if (!ModuleFolders.ContainsKey(module)) throw new ArgumentException("Module SeaPilot inconnu. Mettez le lanceur a jour depuis Administration.");
        string root = ConfiguredRoot();
        if (!String.IsNullOrEmpty(root)) return Path.Combine(ValidateRoot(root), ModuleFolders[module]);
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
        string root = DetectRoot(ConfiguredRoot(), DefaultRoot) ?? SelectRoot(DefaultRoot);
        if (String.IsNullOrEmpty(root)) return;
        root = ConfigureRoot(root);
        MessageBox.Show("Google Drive est bien configure :\n" + root, "SeaPilot Drive");
    }

    [STAThread]
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 2 && args[0] == "--configure-root") { ConfigureRoot(args[1]); return 0; }
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
            string path = ResolvePath(launch.StartsWith("seapilot-drive://root/open/", StringComparison.Ordinal) ? ValidateRoot(ConfiguredRoot()) : ModuleRoot(module), launch);
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
