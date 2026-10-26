/* Rebuild raster platform icons from the single SVG master.
 * Usage: node scripts/render-icon.cjs <absolute sharp module path>
 * Then convert icon.png to a multiresolution ICO with Pillow (see build/README.md).
 */
const path=require('node:path');
const sharp=require(process.argv[2]||'sharp');
const root=path.join(__dirname,'..');
sharp(path.join(root,'build/icon.svg'),{density:768}).resize(1024,1024).png().toFile(path.join(root,'build/icon.png')).catch(error=>{console.error(error);process.exitCode=1;});
