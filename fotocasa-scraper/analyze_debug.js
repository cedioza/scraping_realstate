
import fs from 'fs';

const content = fs.readFileSync('debug_script.txt', 'utf8');
console.log('Total length:', content.length);
console.log('--- START (500 chars) ---');
console.log(content.substring(0, 500));
console.log('--- END (500 chars) ---');
console.log(content.substring(content.length - 500));


// Extract JSON string
const jsonMatch = content.match(/window\.__INITIAL_DATA__\s*=\s*JSON\.parse\((.*?)\);/s);
if (jsonMatch && jsonMatch[1]) {
    console.log('--- FOUND MATCH ---');
    try {
        const jsonString = jsonMatch[1];
        // The regex captures the string literal including quotes? No, (.*?) captures inside.
        // But wait, the source is JSON.parse("...").
        // So (.*?) captures "...".
        // This IS a JSON string (a string literal).
        // So we need to parse it as a string first to get the actual JSON content?
        // JSON.parse("\"foo\"") -> "foo"
        // JSON.parse("{\"a\":1}") -> ERROR because { is not valid at start of string literal unless quoted? 
        // Wait. JS source: JSON.parse("{\"a\":1}");
        // Extracted: "{\"a\":1}" (including quotes).
        // JSON.parse("\"{\\\"a\\\":1}\"") -> {"a":1}

        const stringValue = JSON.parse(jsonMatch[1]); // Parse the string literal to get the inner string
        // Wait, if jsonMatch[1] is the raw characters from the file, e.g. "{\"a\":1}" including the quotes.
        // Then JSON.parse(jsonMatch[1]) returns the string '{"a":1}'.
        // Then we need to parse THAT string.

        console.log('Parsed outer string successfully.');
        // console.log('Inner string (first 100):', typeof stringValue, stringValue.substring(0, 100));

        if (typeof stringValue === 'string') {
            const data = JSON.parse(stringValue);
            console.log('Parsed inner JSON successfully.');
            console.log('Root Keys:', Object.keys(data));

            if (data.initialResults) {
                console.log('initialResults Keys:', Object.keys(data.initialResults));
                if (data.initialResults.realEstates) {
                    console.log('Num realEstates:', data.initialResults.realEstates.length);
                }
                // Maybe it's called 'listings' or 'results'?
            } else {
                console.log('initialResults NOT FOUND. Dumping keys...');
                // Dump deep keys
            }
        } else {
            console.log('Value is not a string:', stringValue);
            // Maybe it was already an object? (Unlikely with JSON.parse("..."))
            console.log('Root Keys:', Object.keys(stringValue));
        }

    } catch (e) {
        console.error('Error parsing:', e.message);
    }
} else {
    console.log('Regex did not match.');
}
