const fs = require('fs');
const path = require('path');
// glob not used
// Actually, let's use a simple recursive read since glob might not be available in node_modules directly.

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? 
            walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

function processFile(filePath) {
    if (!filePath.endsWith('.ts')) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Add class properties based on `this.propertyName = ` assignments.
    // We will look for `class ClassName {` and then find all `this.propName =` inside it.
    // This is a naive regex approach but works for most standard cases.
    
    // Find all class bodies
    const classRegex = /class\s+[A-Za-z0-9_]+\s*(?:extends\s+[A-Za-z0-9_]+)?\s*{([\s\S]*?)^}/gm;
    let newContent = content;
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
        let classBody = match[1];
        let classStartIndex = match.index;
        let props = new Set();
        
        const thisPropRegex = /this\.([a-zA-Z0-9_]+)\s*=[^=]/g;
        let propMatch;
        while ((propMatch = thisPropRegex.exec(classBody)) !== null) {
            props.add(propMatch[1]);
        }
        
        if (props.size > 0) {
            let propDeclarations = Array.from(props).map(p => `  ${p}: any;`).join('\n') + '\n';
            // Insert properties at the beginning of the class
            const firstBrace = newContent.indexOf('{', classStartIndex);
            newContent = newContent.slice(0, firstBrace + 1) + '\n' + propDeclarations + newContent.slice(firstBrace + 1);
        }
    }
    
    // 2. Add `any` to implicit any parameters in functions without JSDoc type info
    // Wait, regex for this is very complex.
    // Let's do a simple replace for common patterns:
    // `function foo(a, b)` -> `function foo(a: any, b: any)`
    // To do this safely, we might just want to use a TS codemod or standard regex.
    
    fs.writeFileSync(filePath, newContent, 'utf8');
}

walkDir('src', processFile);
console.log("Finished adding class properties.");
