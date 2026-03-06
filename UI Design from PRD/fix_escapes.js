const fs = require('fs');
const file = 'src/app/components/CostAnalysis.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync(file, content);
console.log('Fixed');
