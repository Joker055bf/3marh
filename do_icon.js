const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceImage = "C:\\Users\\baslo\\.gemini\\antigravity\\brain\\46b10d85-915e-452d-ad09-5db4d8232c1d\\media__1777229590477.png";
const assetsDir = path.join(__dirname, 'assets');

if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir);
}

const iconDest = path.join(assetsDir, 'icon.png');
const splashDest = path.join(assetsDir, 'splash.png');

console.log("Copying image for icon and splash screen...");
try {
    fs.copyFileSync(sourceImage, iconDest);
    fs.copyFileSync(sourceImage, splashDest);
    console.log("Image copied successfully!");
} catch (e) {
    console.error("Failed to copy image:", e);
    process.exit(1);
}

console.log("Generating Android assets via capacitor-assets...");
try {
    execSync('npx -y @capacitor/assets generate --android', { stdio: 'inherit' });
    console.log("Assets generated successfully!");
} catch (e) {
    console.error("Failed to generate assets:", e);
    process.exit(1);
}
