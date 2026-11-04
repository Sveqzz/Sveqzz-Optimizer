'use strict';
// Capa de acceso al sistema. WinBackend ejecuta reg.exe / PowerShell reales.
// MockBackend simula todo en memoria para poder probar la lógica fuera de Windows.
const { execFile } = require('child_process');

function run(file, args = [], timeout = 90000) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => resolve({
        code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
        stdout: stdout || '', stderr: (stderr || '') + (err && typeof err.code !== 'number' ? String(err.message) : ''),
      }));
  });
}

function parseRegLines(out) {
  const items = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s{2,}(.+?)\s{2,}(REG_[A-Z_]+)(?:\s{2,}(.*))?$/);
    if (!m) continue;
    const kind = m[2].slice(4);
    let data = (m[3] || '').trim();
    if (kind === 'DWORD' || kind === 'QWORD') data = parseInt(data, 16);
    else if (kind === 'BINARY') data = data.toLowerCase();
    items.push({ name: m[1], kind, data });
  }
  return items;
}

const psArgs = (script) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script];

class WinBackend {
  constructor() { this.mock = false; }
  async isAdmin() { return (await run('net', ['session'], 8000)).code === 0; }
  async regRead(h, p, n) {
    const r = await run('reg', ['query', `${h}\\${p}`, '/v', n], 15000);
    if (r.code !== 0) return { exists: false };
    const it = parseRegLines(r.stdout).find((x) => x.name.toLowerCase() === n.toLowerCase());
    return it ? { exists: true, kind: it.kind, data: it.data } : { exists: false };
  }
  async regReadAll(h, p) {
    const r = await run('reg', ['query', `${h}\\${p}`], 15000);
    return r.code === 0 ? parseRegLines(r.stdout) : [];
  }
  async regWrite(h, p, n, kind, data) {
    const r = await run('reg', ['add', `${h}\\${p}`, '/v', n, '/t', `REG_${kind}`, '/d', String(data), '/f'], 15000);
    if (r.code !== 0) throw new Error((r.stderr || r.stdout || 'reg add falló').trim());
  }
  async regDelete(h, p, n) { await run('reg', ['delete', `${h}\\${p}`, '/v', n, '/f'], 15000); }
  async keyExists(h, p) { return (await run('reg', ['query', `${h}\\${p}`], 15000)).code === 0; }
  async keyWriteDefault(h, p) {
    const r = await run('reg', ['add', `${h}\\${p}`, '/ve', '/d', '', '/f'], 15000);
    if (r.code !== 0) throw new Error((r.stderr || 'reg add falló').trim());
  }
  async keyDelete(h, p) { await run('reg', ['delete', `${h}\\${p}`, '/f'], 15000); }
  async serviceRunning(name) {
    const r = await run('sc', ['query', name], 10000);
    return r.code === 0 && /RUNNING/.test(r.stdout);
  }
  async serviceStop(name) { await run('sc', ['stop', name], 20000); }
  async serviceStart(name) { await run('sc', ['start', name], 20000); }
  async ps(script, timeout) {
    const r = await run('powershell.exe', psArgs(script), timeout || 90000);
    return r;
  }
  // Devuelve true/false según la salida "True"/"False" de un script de comprobación
  async psCheck(script) {
    const r = await this.ps(script, 30000);
    if (r.code !== 0 && !r.stdout.trim()) return null;
    return /true/i.test(r.stdout) ? true : (/false/i.test(r.stdout) ? false : null);
  }
  async psValue(script) { const r = await this.ps(script, 30000); return r.code === 0 ? r.stdout.trim() : ''; }
  // tasks: [{path:'\\Microsoft\\...\\', name:'X'}] -> { 'path+name': 'Ready'|'Disabled'|null }
  async taskStates(tasks) {
    if (!tasks.length) return {};
    const list = tasks.map((t) => `@('${t.path}','${t.name}')`).join(',');
    const script = `@(${list}) | ForEach-Object { $t = Get-ScheduledTask -TaskPath $_[0] -TaskName $_[1] -ErrorAction SilentlyContinue; if ($t) { '{0}{1}|{2}' -f $_[0],$_[1],$t.State } else { '{0}{1}|NA' -f $_[0],$_[1] } }`;
    const r = await this.ps(script, 60000);
    const out = {};
    for (const line of r.stdout.split(/\r?\n/)) {
      const i = line.lastIndexOf('|');
      if (i > 0) { const s = line.slice(i + 1).trim(); out[line.slice(0, i)] = s === 'NA' ? null : s; }
    }
    return out;
  }
  async taskSet(path, name, enabled) {
    const cmd = enabled ? 'Enable-ScheduledTask' : 'Disable-ScheduledTask';
    await this.ps(`${cmd} -TaskPath '${path}' -TaskName '${name}' -ErrorAction SilentlyContinue | Out-Null`, 30000);
  }
  async exec(file, args, timeout) { return run(file, args, timeout); }

  // Lee TODO el estado en UNA sola llamada de PowerShell (registro, servicios, tareas, claves, comprobaciones y valores).
  // req = { regs:[{h,p,n}], svcs:[name], tasks:[{path,name}], keys:[{h,p}], checks:[script], vals:[script] }
  async probe(req) {
    const os = require('os'), fs = require('fs'), path = require('path');
    const id = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const jf = path.join(os.tmpdir(), `sveqzz-${id}.json`), sf = path.join(os.tmpdir(), `sveqzz-${id}.ps1`);
    fs.writeFileSync(jf, JSON.stringify(req), 'utf8');
    fs.writeFileSync(sf, '﻿' + PROBE_PS.replace('__JSON__', jf.replace(/'/g, "''")), 'utf8');
    try {
      const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', sf], 120000);
      const m = r.stdout.match(/@@SVQ@@(.*)$/m);
      if (!m) throw new Error('probe sin salida: ' + (r.stderr || r.stdout).slice(0, 200));
      return JSON.parse(m[1]);
    } finally { fs.promises.unlink(jf).catch(() => {}); fs.promises.unlink(sf).catch(() => {}); }
  }
  async hwScan() {
    const r = await run('powershell.exe', psArgs(HW_PS), 60000);
    const m = r.stdout.match(/@@SVQ@@(.*)$/m);
    return m ? JSON.parse(m[1]) : null;
  }
}

const PROBE_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$req = Get-Content -Raw -Encoding UTF8 -LiteralPath '__JSON__' | ConvertFrom-Json
$roots = @{ HKLM = [Microsoft.Win32.Registry]::LocalMachine; HKCU = [Microsoft.Win32.Registry]::CurrentUser }
$kinds = @{ DWord='DWORD'; String='SZ'; Binary='BINARY'; ExpandString='EXPAND_SZ'; QWord='QWORD'; MultiString='MULTI_SZ' }
$o = [ordered]@{ regs=@(); svcs=@(); tasks=@{}; keys=@(); checks=@(); vals=@() }
foreach ($r in $req.regs) {
  $e = $false; $k = $null; $v = $null
  $key = $roots[$r.h].OpenSubKey($r.p)
  if ($key) {
    if ($key.GetValueNames() -contains $r.n) {
      $e = $true; $kn = $key.GetValueKind($r.n).ToString(); $k = $kinds[$kn]; $v = $key.GetValue($r.n, $null, 'DoNotExpandEnvironmentNames')
      if ($kn -eq 'Binary') { $v = (($v | ForEach-Object { $_.ToString('x2') }) -join '') }
      elseif ($kn -eq 'DWord') { $v = [BitConverter]::ToUInt32([BitConverter]::GetBytes([int]$v), 0) }
      elseif ($kn -eq 'MultiString') { $v = ($v -join ',') }
    }
    $key.Close()
  }
  $o.regs += [pscustomobject]@{ e=$e; k=$k; v=$v }
}
foreach ($n in $req.svcs) { $s = Get-Service -Name $n; $o.svcs += [bool]($s -and $s.Status -eq 'Running') }
foreach ($t in $req.tasks) { $x = Get-ScheduledTask -TaskPath $t.path -TaskName $t.name; $o.tasks[$t.path + $t.name] = if ($x) { [string]$x.State } else { $null } }
foreach ($k in $req.keys) { $key = $roots[$k.h].OpenSubKey($k.p); $o.keys += [bool]$key; if ($key) { $key.Close() } }
foreach ($c in $req.checks) { try { $x = & ([scriptblock]::Create($c)); if ($x -is [array]) { $x = $x[-1] }; $o.checks += [bool]$x } catch { $o.checks += $null } }
foreach ($c in $req.vals) { try { $x = & ([scriptblock]::Create($c)); $o.vals += (($x | Out-String).Trim()) } catch { $o.vals += '' } }
'@@SVQ@@' + (ConvertTo-Json -InputObject $o -Compress -Depth 6)
`;

const HW_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$cs = Get-CimInstance Win32_ComputerSystem; $os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$bb = Get-CimInstance Win32_BaseBoard; $bios = Get-CimInstance Win32_BIOS
$enc = Get-CimInstance Win32_SystemEnclosure; $bat = Get-CimInstance Win32_Battery
$gpus = @(Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion, CurrentRefreshRate, CurrentHorizontalResolution, CurrentVerticalResolution, PNPDeviceID)
$ram = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Manufacturer, Capacity, Speed, ConfiguredClockSpeed, SMBIOSMemoryType, PartNumber, DeviceLocator)
$disks = @(Get-PhysicalDisk | Select-Object FriendlyName, MediaType, BusType, Size, HealthStatus)
$vols = @(Get-Volume | Where-Object { $_.DriveLetter } | Select-Object DriveLetter, Size, SizeRemaining, FileSystemLabel)
$plan = (powercfg /getactivescheme) -replace '.*\((.*)\).*', '$1'
$temp = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature | Select-Object -First 1 -ExpandProperty CurrentTemperature
$boot = $os.LastBootUpTime
$o = [ordered]@{
  model = ($cs.Manufacturer + ' ' + $cs.Model).Trim(); chassis = @($enc.ChassisTypes); battery = [bool]$bat
  cpu = [ordered]@{ name = $cpu.Name.Trim(); cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors; mhz = $cpu.MaxClockSpeed; l3 = $cpu.L3CacheSize }
  board = ($bb.Manufacturer + ' ' + $bb.Product).Trim(); bios = ($bios.SMBIOSBIOSVersion + ' (' + $bios.ReleaseDate.ToString('yyyy-MM-dd') + ')')
  os = $os.Caption; build = [int]$os.BuildNumber; arch = $os.OSArchitecture; boot = if ($boot) { $boot.ToString('o') } else { $null }
  gpus = $gpus; ram = $ram; disks = $disks; vols = $vols; plan = $plan
  cpuTempC = if ($temp) { [math]::Round(($temp / 10) - 273.15) } else { $null }
}
'@@SVQ@@' + (ConvertTo-Json -InputObject $o -Compress -Depth 5)
`;

class MockBackend {
  constructor() { this.mock = true; this.reg = new Map(); this.keys = new Set(); this.tasks = new Map(); this.svcRunning = new Set(['DiagTrack', 'SysMain', 'WSearch']); this.log = []; }
  k(h, p, n) { return `${h}\\${p}\\${n}`.toLowerCase(); }
  async isAdmin() { return true; }
  async regRead(h, p, n) { const v = this.reg.get(this.k(h, p, n)); return v ? { exists: true, ...v } : { exists: false }; }
  async regReadAll(h, p) {
    const pre = `${h}\\${p}\\`.toLowerCase(); const out = [];
    for (const [k, v] of this.reg) if (k.startsWith(pre) && !k.slice(pre.length).includes('\\')) out.push({ name: k.slice(pre.length), kind: v.kind, data: v.data });
    return out;
  }
  async regWrite(h, p, n, kind, data) { this.log.push(['w', h, p, n]); this.reg.set(this.k(h, p, n), { kind, data: kind === 'DWORD' ? Number(data) : String(data) }); }
  async regDelete(h, p, n) { this.reg.delete(this.k(h, p, n)); }
  async keyExists(h, p) { return this.keys.has(`${h}\\${p}`.toLowerCase()); }
  async keyWriteDefault(h, p) { this.keys.add(`${h}\\${p}`.toLowerCase()); }
  async keyDelete(h, p) { this.keys.delete(`${h}\\${p}`.toLowerCase()); }
  async serviceRunning(n) { return this.svcRunning.has(n); }
  async serviceStop(n) { this.svcRunning.delete(n); }
  async serviceStart(n) { this.svcRunning.add(n); }
  async ps() { return { code: 0, stdout: '', stderr: '' }; }
  async psCheck() { return null; }
  async psValue() { return ''; }
  async taskStates(tasks) { const o = {}; for (const t of tasks) o[t.path + t.name] = this.tasks.get(t.path + t.name) || 'Ready'; return o; }
  async taskSet(path, name, en) { this.tasks.set(path + name, en ? 'Ready' : 'Disabled'); }
  async exec() { return { code: 0, stdout: '', stderr: '' }; }
  async probe(req) {
    const out = { regs: [], svcs: [], tasks: {}, keys: [], checks: [], vals: [] };
    for (const r of req.regs || []) { const v = await this.regRead(r.h, r.p, r.n); out.regs.push({ e: v.exists, k: v.kind || null, v: v.data ?? null }); }
    for (const n of req.svcs || []) out.svcs.push(await this.serviceRunning(n));
    out.tasks = await this.taskStates(req.tasks || []);
    for (const k of req.keys || []) out.keys.push(await this.keyExists(k.h, k.p));
    out.checks = (req.checks || []).map(() => null); out.vals = (req.vals || []).map(() => '');
    return out;
  }
  async hwScan() {
    return { model: 'PC de prueba (simulado)', chassis: [10], battery: true, cpu: { name: 'Intel(R) Core(TM) i7-12700H', cores: 14, threads: 20, mhz: 2300, l3: 24576 }, board: 'Simulada X1', bios: '1.0 (2024-01-01)', os: 'Windows 11 Pro', build: 22631, arch: '64 bits', boot: new Date(Date.now() - 3 * 864e5).toISOString(),
      gpus: [{ Name: 'Intel(R) Iris(R) Xe Graphics', AdapterRAM: 1073741824, DriverVersion: '31.0.101.4502', CurrentRefreshRate: 144, CurrentHorizontalResolution: 1920, CurrentVerticalResolution: 1080, PNPDeviceID: 'PCI\\VEN_8086' }, { Name: 'NVIDIA GeForce RTX 3060 Laptop GPU', AdapterRAM: 4293918720, DriverVersion: '31.0.15.5222', CurrentRefreshRate: 144, CurrentHorizontalResolution: 1920, CurrentVerticalResolution: 1080, PNPDeviceID: 'PCI\\VEN_10DE' }],
      ram: [{ Manufacturer: 'Samsung', Capacity: 17179869184, Speed: 4800, ConfiguredClockSpeed: 4800, SMBIOSMemoryType: 34, PartNumber: 'M425', DeviceLocator: 'DIMM A' }],
      disks: [{ FriendlyName: 'Samsung SSD 970 EVO', MediaType: 'SSD', BusType: 'NVMe', Size: 512110190592, HealthStatus: 'Healthy' }], vols: [{ DriveLetter: 'C', Size: 511e9, SizeRemaining: 123e9, FileSystemLabel: '' }],
      plan: 'Equilibrado', cpuTempC: 61 };
  }
}

function createBackend(forceMock) {
  return (process.platform === 'win32' && !forceMock) ? new WinBackend() : new MockBackend();
}

module.exports = { createBackend, WinBackend, MockBackend, run, parseRegLines };
