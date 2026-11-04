'use strict';
// Detecta drivers instalados (versión y fecha), dispositivos sin driver y enlaces oficiales de descarga.
const LINKS = {
  nvidia: ['NVIDIA', 'https://www.nvidia.com/Download/index.aspx?lang=es'],
  amd: ['AMD', 'https://www.amd.com/es/support/download/drivers.html'],
  intel: ['Intel', 'https://www.intel.com/content/www/us/en/download-center/home.html'],
  realtek: ['Realtek', 'https://www.realtek.com/Download'],
  wu: ['Windows Update', 'https://support.microsoft.com/windows/update-drivers-manually-in-windows-ec62f46c-ff14-c91d-eead-d7126dc1f7b6'],
};
const vendorOf = (s) => /nvidia/i.test(s) ? 'nvidia' : /advanced micro|amd|radeon|ati\b/i.test(s) ? 'amd' : /intel/i.test(s) ? 'intel' : /realtek/i.test(s) ? 'realtek' : 'wu';
const CLS = { Display: 'Gráficos', MEDIA: 'Audio', Net: 'Red / WiFi', Bluetooth: 'Bluetooth', System: 'Chipset / sistema', USB: 'USB', HIDClass: 'Dispositivos HID', Image: 'Cámara' };

async function scan(be) {
  const raw = await be.psValue("$o=@(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceClass -in 'DISPLAY','MEDIA','NET','BLUETOOTH','SYSTEM','USB','IMAGE' -and $_.DriverVersion -and $_.DeviceName } | Sort-Object DeviceName -Unique | Select-Object -First 80 DeviceName,DeviceClass,Manufacturer,DriverVersion,@{n='D';e={if($_.DriverDate){$_.DriverDate.ToString('yyyy-MM-dd')}}}); $p=@(Get-CimInstance Win32_PnPEntity | Where-Object { $_.ConfigManagerErrorCode -in 28,1,22 } | Select-Object -First 20 Name,ConfigManagerErrorCode); @{drivers=$o;missing=$p} | ConvertTo-Json -Depth 4 -Compress");
  let j = { drivers: [], missing: [] };
  try { j = JSON.parse(raw); } catch { /* sin datos */ }
  const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const now = Date.now();
  const drivers = arr(j.drivers).map((d) => {
    const ageDays = d.D ? Math.floor((now - Date.parse(d.D)) / 864e5) : null;
    const v = vendorOf(`${d.Manufacturer} ${d.DeviceName}`);
    const gfx = /display/i.test(d.DeviceClass);
    const old = ageDays != null && ageDays > (gfx ? 120 : 730);
    return { name: d.DeviceName, cls: CLS[String(d.DeviceClass)] || d.DeviceClass, maker: d.Manufacturer, version: d.DriverVersion, date: d.D, ageDays, status: old ? 'old' : 'ok', link: LINKS[v][1], linkName: LINKS[v][0] };
  }).sort((a, b) => (b.status === 'old') - (a.status === 'old'));
  const missing = arr(j.missing).map((m) => ({ name: m.Name, code: m.ConfigManagerErrorCode, link: LINKS.wu[1], linkName: LINKS.wu[0] }));
  return { drivers, missing, old: drivers.filter((d) => d.status === 'old').length };
}
module.exports = { scan, LINKS };
