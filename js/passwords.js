// Password rules. The password is the only thing protecting the encrypted data,
// and anyone who copies that data can try guesses offline at full speed, so
// easy-to-guess passwords are refused (not just short ones). Pure: no DOM.

export const MIN_PASSWORD = 8;

// The most common passwords (worldwide and India), all at least 8 characters.
const COMMON = new Set([
    'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'pa$$word',
    '12345678', '123456789', '1234567890', '0123456789', '11111111', '00000000', '12341234', '123123123',
    '87654321', '987654321', '11223344', '12121212', '99999999', '88888888', '1q2w3e4r', '1qaz2wsx',
    'qwertyui', 'qwertyuiop', 'qwerty12', 'qwerty123', 'asdfghjk', 'asdfghjkl', 'zxcvbnm1', 'abcd1234',
    'abc12345', 'abcdefgh', 'iloveyou', 'iloveyou1', 'admin123', 'administrator', 'welcome1', 'welcome123',
    'letmein1', 'sunshine', 'princess', 'football', 'baseball', 'superman', 'starwars', 'whatever',
    'trustno1', 'monkey123', 'dragon123', 'master123', 'india123', 'india@123', 'bharat123', 'krishna123',
    'sairam123', 'omsairam', 'jaishriram', 'budget123', 'money123', 'mypassword', 'changeme', 'computer',
]);

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];

/** "12345678", "abcdefgh", "87654321", "qwertyui": a run along the alphabet, digits or a keyboard row. */
function isRun(text) {
    const codes = [...text].map((c) => c.charCodeAt(0));
    const step = codes[1] - codes[0];
    if (Math.abs(step) === 1 && codes.every((c, i) => i === 0 || c - codes[i - 1] === step)) return true;
    return KEYBOARD_ROWS.some((row) => row.includes(text) || [...row].reverse().join('').includes(text));
}

/** What's wrong with a new password, in plain words; '' if it's fine. */
export function passwordProblem(password, name = '') {
    const pw = String(password);
    if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for your password.`;
    const low = pw.toLowerCase();
    const tip = 'Try a longer phrase that only you would know, like three random words.';
    if (COMMON.has(low)) return `That password is one of the most common ones and easy to guess. ${tip}`;
    if (/^(.)\1+$/.test(pw)) return `A password of one repeated character is easy to guess. ${tip}`;
    if (isRun(low)) return `A run like 12345678 or abcdefgh is easy to guess. ${tip}`;
    const first = String(name).trim().toLowerCase().split(/\s+/)[0] ?? '';
    if (first.length >= 3 && low.includes(first)) return `Don’t use your name in the password. ${tip}`;
    return '';
}
