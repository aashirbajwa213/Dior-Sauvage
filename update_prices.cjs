const fs = require('fs');
const path = require('path');

const dir = 'src'; // Process entire src dir

function walkDir(currentPath) {
    const files = fs.readdirSync(currentPath);
    for (const file of files) {
        const fullPath = path.join(currentPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.match(/\.(astro|md|ts|js)$/)) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            
            const originalContent = content;
            
            // Replace ranges
            content = content.replace(/450-550/g, '500-600');
            content = content.replace(/450 - 550/g, '500 - 600');
            content = content.replace(/450–550/g, '500–600'); // en dash
            
            // Replace strings
            content = content.replace(/PKR 450/g, 'PKR 500');
            content = content.replace(/PKR 550/g, 'PKR 600');
            
            content = content.replace(/base_price: 450/g, 'base_price: 500');
            content = content.replace(/base_price: 550/g, 'base_price: 600');
            
            content = content.replace(/price: 450/g, 'price: 500');
            content = content.replace(/price: 550/g, 'price: 600');
            
            content = content.replace(/pack_price: 450,/g, 'pack_price: 500,');
            content = content.replace(/pack_price: 450.0/g, 'pack_price: 500.0');
            content = content.replace(/pack_price: 550.0/g, 'pack_price: 600.0');
            
            // Pack of 10 prices
            content = content.replace(/pack_price: 4500.0/g, 'pack_price: 5000.0');
            content = content.replace(/pack_price: 5500.0/g, 'pack_price: 6000.0');

            // Placeholders
            content = content.replace(/placeholder="550"/g, 'placeholder="600"');
            
            // specific blog post text:
            content = content.replace(/From PKR 450/g, 'From PKR 500');

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('Updated:', fullPath);
            }
        }
    }
}

walkDir(dir);
