using System;
using System.Diagnostics;
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
        const string prefix = "seapilot-drive://open/";
        if (launchUri == null || !launchUri.StartsWith(prefix, StringComparison.Ordinal) || launchUri.Length > 2100)
            throw new ArgumentException("Lien SeaPilot invalide.");
        string payload = launchUri.Substring(prefix.Length);
        if (!Regex.IsMatch(payload, @"\A[A-Za-z0-9_-]+\z")) throw new ArgumentException("Lien SeaPilot invalide.");
        payload = payload.Replace('-', '+').Replace('_', '/');
        payload = payload.PadRight((payload.Length + 3) / 4 * 4, '=');
        string relative = new UTF8Encoding(false, true).GetString(Convert.FromBase64String(payload));
        if (relative.Length == 0 || relative.Length > 500 || relative.Contains("\\")
            || !Regex.IsMatch(relative, @"\.(docx?|xlsx?|pptx?|odt|ods|odp|txt)\z", RegexOptions.IgnoreCase))
            throw new ArgumentException("Format de fichier non autorise.");
        foreach (string part in relative.Split('/'))
        {
            if (part.Length == 0 || part == "." || part == ".." || Regex.IsMatch(part, "[<>:\"|?*\\x00-\\x1f]")
                || Regex.IsMatch(part, @"[. ]\z")
                || Regex.IsMatch(part, @"\A(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|\z)", RegexOptions.IgnoreCase))
                throw new ArgumentException("Chemin de fichier non autorise.");
        }
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
            dialog.Description = "Selectionnez le dossier Google Drive SeaPilot / Procedures synchronise sur ce PC.";
            dialog.ShowNewFolderButton = false;
            if (dialog.ShowDialog() != DialogResult.OK) return;
            using (var key = Registry.CurrentUser.CreateSubKey(SettingsKey)) key.SetValue("Root", dialog.SelectedPath);
            MessageBox.Show("Dossier SeaPilot configure :\n" + dialog.SelectedPath, "SeaPilot Drive");
        }
    }

    [STAThread]
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length != 1) throw new ArgumentException("Un seul lien SeaPilot est attendu.");
            if (args[0] == "seapilot-drive://configure" || args[0] == "seapilot-drive://configure/")
            {
                Configure();
                return 0;
            }
            string root;
            using (var key = Registry.CurrentUser.OpenSubKey(SettingsKey)) root = key == null ? null : key.GetValue("Root") as string;
            string path = ResolvePath(root, args[0]);
            // Pass the verified filename directly to Windows, never to cmd or PowerShell.
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "SeaPilot Drive", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }
    }
}
