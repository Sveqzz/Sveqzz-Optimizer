'use strict';
// Prioridad máxima para lo que tienes conectado: Wi-Fi/Ethernet, ratón, teclado, mandos, GPU, Bluetooth.
// Aplica ahorro de energía desactivado, prioridad de interrupciones y (en red) métrica de ruta prioritaria. Todo se restaura.
const ID_RE = /^[A-Za-z0-9_&\-\\.{}#]{6,200}$/;
const E = 'SYSTEM\\CurrentControlSet\\Enum\\';
const WIFI_SUB = '19cbb8fa-5279-450e-9fac-8a3d5fedd0c1', WIFI_SET = '12bbebe6-58d6-4636-95bb-3217ef867c1a';

function parse(out) { const m = out.match(/@@SVQ@@(.*)$/m); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } }

async function list(be, state) {
  const prio = state.data.devPrio || {};
  let raw;
  if (be.mock) raw = be._mockDevices || [{ id: 'PCI\\VEN_10EC&DEV_8168\\4&1', name: 'Realtek PCIe GbE Family Controller', cls: 'Net', ifIndex: 12, ifName: 'Ethernet', wifi: false, up: true }, { id: 'PCI\\VEN_8086&DEV_2723\\4&2', name: 'Intel(R) Wi-Fi 6 AX200', cls: 'Net', ifIndex: 7, ifName: 'Wi-Fi', wifi: true, up: true }, { id: 'HID\\VID_046D&PID_C08B\\6&1', name: 'Logitech G502 (ratón HID)', cls: 'Mouse' }, { id: 'USB\\VID_1B1C&PID_1B2D\\7&3', name: 'Teclado USB', cls: 'Keyboard' }, { id: 'USB\\VID_045E&PID_028E\\5&9', name: 'Xbox 360 Controller', cls: 'XboxComposite' }, { id: 'PCI\\VEN_10DE&DEV_2504\\4&3', name: 'NVIDIA GeForce RTX 3050', cls: 'Display' }];
  else {
    const ps = String.raw`$ErrorActionPreference='SilentlyContinue'
$nets = @{}; Get-NetAdapter -Physical | ForEach-Object { $nets[$_.PnPDeviceID] = $_ }
$d = Get-PnpDevice -PresentOnly | Where-Object { ($_.Class -in 'Net','Mouse','Keyboard','XboxComposite','Display','Bluetooth') -or ($_.Class -eq 'HIDClass' -and $_.FriendlyName -match 'game controller|gamepad|xbox|dualsense|dualshock|wireless controller|joystick|mando') } | Where-Object { $_.InstanceId -notmatch '^(ROOT|SWD)\\' } | ForEach-Object {
  $n = $nets[$_.InstanceId]
  [pscustomobject]@{ id = $_.InstanceId; name = $_.FriendlyName; cls = $_.Class; ifIndex = $(if ($n) { $n.InterfaceIndex }); ifName = $(if ($n) { $n.Name }); wifi = $(if ($n) { $n.PhysicalMediaType -match '802.11|Native' } else { $false }); up = $(if ($n) { $n.Status -eq 'Up' } else { $true }) } }
'@@SVQ@@' + (ConvertTo-Json -InputObject @($d) -Compress)`;
    raw = [].concat((parse((await be.ps(ps, 30000)).stdout)) || []);
  }
  const kind = (d) => d.cls === 'Net' ? (d.wifi ? 'Wi-Fi' : 'Ethernet') : ({ Mouse: 'Ratón', Keyboard: 'Teclado', XboxComposite: 'Mando', HIDClass: 'Mando', Display: 'Gráfica', Bluetooth: 'Bluetooth' })[d.cls] || d.cls;
  const seen = new Set();
  return raw.filter((d) => d && ID_RE.test(d.id || '') && !seen.has(d.id) && seen.add(d.id)).map((d) => ({ ...d, kind: kind(d), boosted: !!prio[d.id] }))
    .sort((a, b) => ['Wi-Fi', 'Ethernet', 'Ratón', 'Teclado', 'Mando', 'Gráfica', 'Bluetooth'].indexOf(a.kind) - ['Wi-Fi', 'Ethernet', 'Ratón', 'Teclado', 'Mando', 'Gráfica', 'Bluetooth'].indexOf(b.kind));
}

async function snapReg(be, h, p, n) { const v = await be.regRead(h, p, n); return { h, p, n, e: !!v.exists, k: v.kind, v: v.data }; }

async function boost(be, state, id) {
  const dev = (await list(be, state)).find((d) => d.id === id);
  if (!dev) throw new Error('Ese dispositivo ya no está conectado');
  state.data.devPrio = state.data.devPrio || {};
  if (state.data.devPrio[id]) return { already: true };
  const base = E + dev.id + '\\Device Parameters';
  const rec = { name: dev.name, kind: dev.kind, at: Date.now(), regs: [], steps: [] };
  const setReg = async (p, n, v) => { rec.regs.push(await snapReg(be, 'HKLM', p, n)); await be.regWrite('HKLM', p, n, 'DWORD', v); rec.steps.push(n); };
  const tryStep = async (fn) => { try { await fn(); } catch (e) { rec.err = String(e.message || e).slice(0, 120); } };
  const pci = /^PCI\\/i.test(dev.id);
  if (pci) { await tryStep(() => setReg(base + '\\Interrupt Management\\MessageSignaledInterruptProperties', 'MSISupported', 1)); await tryStep(() => setReg(base + '\\Interrupt Management\\Affinity Policy', 'DevicePriority', 3)); }
  else { await tryStep(() => setReg(base, 'EnhancedPowerManagementEnabled', 0)); await tryStep(() => setReg(base, 'SelectiveSuspendEnabled', 0)); }
  // casilla «Permitir que el equipo apague este dispositivo»
  if (!be.mock) {
    const prev = (await be.ps(`$ErrorActionPreference='SilentlyContinue'; $m = Get-CimInstance -Namespace root/wmi -ClassName MSPower_DeviceEnable | Where-Object { $_.InstanceName -like ('${dev.id.replace(/'/g, "''")}' + '*') } | Select-Object -First 1; if ($m) { [string]$m.Enable }`, 20000)).stdout.trim();
    if (/^(True|False)$/i.test(prev)) { rec.power = prev.toLowerCase() === 'true'; await tryStep(async () => { await be.ps(`Get-CimInstance -Namespace root/wmi -ClassName MSPower_DeviceEnable | Where-Object { $_.InstanceName -like ('${dev.id.replace(/'/g, "''")}' + '*') } | ForEach-Object { Set-CimInstance -InputObject $_ -Property @{ Enable = $false } }`, 20000); rec.steps.push('Sin apagado por ahorro de energía'); }); }
  } else { rec.power = true; rec.steps.push('Sin apagado por ahorro de energía'); }
  if (dev.cls === 'Net' && dev.ifIndex && /^\d+$/.test(String(dev.ifIndex))) {
    const ix = Number(dev.ifIndex);
    if (!be.mock) {
      const cur = (await be.ps(`$i = Get-NetIPInterface -InterfaceIndex ${ix} -AddressFamily IPv4 -ErrorAction SilentlyContinue; if ($i) { '{0}|{1}' -f $i.AutomaticMetric, $i.InterfaceMetric }`, 15000)).stdout.trim();
      const m = cur.match(/^(Enabled|Disabled)\|(\d+)$/i);
      if (m) { rec.metric = { ix, auto: m[1].toLowerCase() === 'enabled', val: Number(m[2]) }; await tryStep(async () => { await be.ps(`Set-NetIPInterface -InterfaceIndex ${ix} -InterfaceMetric 5`, 15000); rec.steps.push('Ruta prioritaria (métrica 5)'); }); }
      if (dev.wifi) {
        const v = (await be.ps(`$m=[regex]::Matches((powercfg /q SCHEME_CURRENT ${WIFI_SUB} ${WIFI_SET} | Out-String),'0x[0-9a-fA-F]{8}'); if($m.Count -ge 2){[Convert]::ToInt32($m[$m.Count-2].Value,16)}`, 15000)).stdout.trim();
        if (/^\d+$/.test(v)) { rec.wifiPlan = Number(v); await tryStep(async () => { await be.ps(`powercfg -setacvalueindex SCHEME_CURRENT ${WIFI_SUB} ${WIFI_SET} 0; powercfg -setactive SCHEME_CURRENT`, 15000); rec.steps.push('Wi-Fi a máximo rendimiento'); }); }
      }
    } else { rec.metric = { ix, auto: true, val: 25 }; rec.steps.push('Ruta prioritaria (métrica 5)'); }
  }
  if (!rec.steps.length) throw new Error(rec.err || 'Windows no permitió cambiar este dispositivo');
  state.data.devPrio[id] = rec; state.log('dispositivo', `Prioridad máxima: ${dev.name}`); state.save();
  return { steps: rec.steps, reboot: pci, err: rec.err || null };
}

async function restore(be, state, id) {
  const rec = (state.data.devPrio || {})[id]; if (!rec) throw new Error('Nada que restaurar');
  for (const r of rec.regs) { try { r.e ? await be.regWrite(r.h, r.p, r.n, r.k, r.v) : await be.regDelete(r.h, r.p, r.n); } catch { /* */ } }
  if (!be.mock) {
    if (typeof rec.power === 'boolean') await be.ps(`Get-CimInstance -Namespace root/wmi -ClassName MSPower_DeviceEnable | Where-Object { $_.InstanceName -like ('${id.replace(/'/g, "''")}' + '*') } | ForEach-Object { Set-CimInstance -InputObject $_ -Property @{ Enable = $${rec.power ? 'true' : 'false'} } }`, 20000);
    if (rec.metric) await be.ps(rec.metric.auto ? `Set-NetIPInterface -InterfaceIndex ${rec.metric.ix} -AutomaticMetric Enabled` : `Set-NetIPInterface -InterfaceIndex ${rec.metric.ix} -InterfaceMetric ${Number(rec.metric.val) || 25}`, 15000);
    if (typeof rec.wifiPlan === 'number') await be.ps(`powercfg -setacvalueindex SCHEME_CURRENT ${WIFI_SUB} ${WIFI_SET} ${rec.wifiPlan}; powercfg -setactive SCHEME_CURRENT`, 15000);
  }
  delete state.data.devPrio[id]; state.log('dispositivo', `Restaurado: ${rec.name}`); state.save();
}

module.exports = { list, boost, restore };
