// Backups: encrypted export, import (encrypted or older plain files),
// CSV export, and the "time for a backup" reminder.

import { getState, exportBackup, importBackup, markBackedUp, METHOD_LABELS } from './store.js';
import * as vault from './vault.js';
import { download, toast, confirmDialog, askPassword } from './ui.js';
import { nowLocal, toDecimal, fmtDate, toLocalString } from './format.js';

const REMIND_AFTER_DAYS = 30;
const SNOOZE_DAYS = 7;
const MIN_ENTRIES = 5; // don't nag about an empty app
const SNOOZE_KEY = 'budget-tracker.backup-snooze';
const today = () => nowLocal().slice(0, 10);

/** Download a password-protected backup of everything. */
export async function downloadBackup() {
    try {
        const file = await vault.exportEncrypted(exportBackup());
        download(`budget-tracker-backup-${today()}.json`, JSON.stringify(file), 'application/json');
        markBackedUp();
        toast('Encrypted backup downloaded');
    } catch (err) {
        console.error(err);
        toast('Could not create the backup. Unlock the app and try again.');
    }
}

// ---- CSV (plain spreadsheet, not encrypted) -----------------------------------------

function csvCell(value) {
    let s = String(value);
    const isNumber = /^-?\d+(\.\d+)?$/.test(s);
    if (!isNumber && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheets treating text as a formula
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCSV() {
    const rows = [['Date', 'Time', 'Type', 'Category', 'Method', 'Note', 'Amount (INR)']];
    for (const t of [...getState().transactions].reverse()) {
        rows.push([t.date.slice(0, 10), t.date.slice(11, 16), t.type === 'income' ? 'Income' : 'Expense', t.category, t.method ? METHOD_LABELS[t.method] : '', t.note, (t.type === 'income' ? '' : '-') + toDecimal(t.amount)]);
    }
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); // BOM so Excel reads ₹ correctly
    download(`budget-tracker-${today()}.csv`, csv, 'text/csv;charset=utf-8');
}

// ---- Import ----------------------------------------------------------------------------

const MAX_BACKUP_BYTES = 25 * 1024 * 1024; // far above any real backup

export async function importFile(file) {
    if (file.size > MAX_BACKUP_BYTES) {
        toast('That file is too big to be a Budget Tracker backup.');
        return;
    }
    let data;
    try {
        data = JSON.parse(await file.text());
    } catch {
        toast('That file is not a Budget Tracker backup.');
        return;
    }

    if (vault.isDamagedBackup(data)) {
        toast('This backup file looks damaged, so it can’t be opened.');
        return;
    }
    if (vault.isEncryptedBackup(data)) {
        const made = data.exportedAt ? ` (made on ${fmtDate(toLocalString(new Date(data.exportedAt)))})` : '';
        const encrypted = data;
        data = await askPassword({
            title: 'Unlock backup',
            message: `This backup is password-protected${made}. Enter the password you were using when it was made.`,
            submit: 'Unlock backup',
            verify: (password) => vault.decryptBackup(encrypted, password),
        });
        if (!data) return; // cancelled
    }

    const count = Array.isArray(data?.transactions) ? data.transactions.length : 0;
    const ok = await confirmDialog({
        title: 'Import backup?',
        message: `The file contains ${count} transaction${count === 1 ? '' : 's'}. They will be added to your current data; transactions you already have are skipped.`,
        ok: 'Import',
    });
    if (!ok) return;
    try {
        const added = importBackup(data);
        if (added !== null) toast(`Imported ${added} new transaction${added === 1 ? '' : 's'}`);
    } catch (err) {
        toast(err.message);
    }
}

// ---- Reminder ---------------------------------------------------------------------------

/** null when no reminder is needed, otherwise { days } (days since last backup, or null if never). */
export function backupReminder() {
    const { transactions, lastBackup } = getState();
    if (transactions.length < MIN_ENTRIES) return null;
    try {
        if (Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0)) return null;
    } catch { /* storage blocked: just remind */ }
    if (!lastBackup) return { days: null };
    const days = Math.floor((Date.now() - new Date(lastBackup).getTime()) / 864e5);
    return days >= REMIND_AFTER_DAYS ? { days } : null;
}

export function snoozeReminder() {
    try {
        localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 864e5));
    } catch { /* ignore */ }
}
