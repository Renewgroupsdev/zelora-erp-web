<#
  Renew Groups ERP - taskbar flash helper (Windows).

  A web page cannot flash Chrome's taskbar button by itself (without a browser alert box). This small helper runs in the
  background on the staff PC and listens on http://localhost:47321 (this PC only). When the ERP website gets a new
  notification / alert while Chrome is not the window in front, it calls /flash, and the helper flashes Chrome's
  taskbar button (orange) until Chrome is clicked.

  Endpoints:
    GET  /health  -> {"ok":true}
    POST /flash   -> flashes every Chrome window's taskbar button
  Only the ERP origin(s) in $AllowedOrigins may call it.

  Run hidden at sign-in with install-helper.cmd (adds it to the Windows Startup folder).
#>

$Port = 47321
# Web origins allowed to ask for a flash (add the live site's origin here).
$AllowedOrigins = @(
  'https://10.123.72.16:4200',
  'http://10.123.72.16:4200',
  'http://localhost:4200',
  'https://localhost:4200',
  'https://crm.renewhairandskincare.com',
  'https://zelorainfotech.com/erp'
)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class TaskbarFlash {
  [StructLayout(LayoutKind.Sequential)]
  public struct FLASHWINFO {
    public uint cbSize;
    public IntPtr hwnd;
    public uint dwFlags;
    public uint uCount;
    public uint dwTimeout;
  }

  [DllImport("user32.dll")] static extern bool FlashWindowEx(ref FLASHWINFO pwfi);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();

  // FLASHW_ALL (3) | FLASHW_TIMERNOFG (12): flash caption + taskbar button until the window comes to the foreground.
  public static bool Flash(IntPtr hwnd) {
    if (hwnd == IntPtr.Zero || hwnd == GetForegroundWindow()) return false;
    FLASHWINFO fi = new FLASHWINFO();
    fi.cbSize = (uint)Marshal.SizeOf(fi);
    fi.hwnd = hwnd;
    fi.dwFlags = 3 | 12;
    fi.uCount = 0;
    fi.dwTimeout = 0;
    return FlashWindowEx(ref fi);
  }
}
'@

function Invoke-ChromeFlash {
  $flashed = 0
  Get-Process -Name chrome -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
    ForEach-Object { if ([TaskbarFlash]::Flash($_.MainWindowHandle)) { $flashed++ } }
  return $flashed
}

function Send-Response($ctx, [int]$status, [string]$body) {
  $res = $ctx.Response
  $origin = $ctx.Request.Headers['Origin']
  if ($origin -and ($AllowedOrigins -contains $origin)) {
    $res.AddHeader('Access-Control-Allow-Origin', $origin)
    $res.AddHeader('Vary', 'Origin')
  }
  $res.AddHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  $res.AddHeader('Access-Control-Allow-Headers', 'Content-Type')
  # Chrome "private / local network access" preflight: the ERP (a LAN / public site) calling this PC's localhost
  $res.AddHeader('Access-Control-Allow-Private-Network', 'true')
  $res.StatusCode = $status
  $bytes = [Text.Encoding]::UTF8.GetBytes($body)
  $res.ContentType = 'application/json'
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.Close()
}

# one helper per PC
$mutex = New-Object Threading.Mutex($false, 'Global\RenewErpTaskbarFlashHelper')
if (-not $mutex.WaitOne(0)) { exit }

$listener = New-Object Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch { Write-Error "Could not listen on port $Port : $_"; exit 1 }

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $req = $ctx.Request
      $origin = $req.Headers['Origin']
      $path = $req.Url.AbsolutePath.TrimEnd('/').ToLowerInvariant()

      if ($req.HttpMethod -eq 'OPTIONS') { Send-Response $ctx 204 ''; continue }
      if ($origin -and -not ($AllowedOrigins -contains $origin)) { Send-Response $ctx 403 '{"ok":false,"error":"origin not allowed"}'; continue }

      switch ($path) {
        '/health' { Send-Response $ctx 200 '{"ok":true}' }
        '/flash' {
          if ($req.HttpMethod -ne 'POST') { Send-Response $ctx 405 '{"ok":false}'; break }
          $n = Invoke-ChromeFlash
          Send-Response $ctx 200 ('{"ok":true,"flashed":' + $n + '}')
        }
        default { Send-Response $ctx 404 '{"ok":false}' }
      }
    } catch {
      try { Send-Response $ctx 500 '{"ok":false}' } catch { }
    }
  }
} finally {
  $listener.Stop()
  $mutex.ReleaseMutex()
}
