'use strict';
// El stub «portable» de NSIS sale como asInvoker. Lo cambiamos a requireAdministrator conservando el tamaño del recurso.
const fs = require('fs'); const path = require('path');
const f = path.join(__dirname, '..', 'dist', 'Sveqzz-Optimizer.exe');
const buf = fs.readFileSync(f);
const from = Buffer.from('level="asInvoker" uiAccess="false"');
const to = Buffer.from('level="requireAdministrator"'.padEnd(from.length, ' '));
const i = buf.indexOf(from);
if (i < 0 || buf.indexOf(from, i + 1) >= 0) { console.error('Manifiesto no encontrado (o duplicado): no se parchea'); process.exit(1); }
to.copy(buf, i); fs.writeFileSync(f, buf); console.log('Manifiesto parcheado: el .exe pedirá administrador');
