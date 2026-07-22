import { createHash, randomUUID } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { BreakageLineInput, IssuedLineInput, RequestLine, ReturnLineInput } from './models';

export const MAX_LINES_PER_OPERATION = 100;
export const MAX_PIECES_PER_LINE = 10_000_000;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return value;
}

export function payloadHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function requireOperationId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', 'A stable operationId is required.');
  }
  return value;
}

export function newServerId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function requireString(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new HttpsError('invalid-argument', `${field} is required and must be at most ${maxLength} characters.`);
  }
  return value.trim();
}

export function requirePieceCount(value: unknown, field: string, allowZero = false): number {
  const numeric = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isSafeInteger(numeric) || (allowZero ? numeric < 0 : numeric <= 0) || numeric > MAX_PIECES_PER_LINE) {
    throw new HttpsError('invalid-argument', `${field} must be a valid whole-piece quantity.`);
  }
  return numeric;
}

function requireLineArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LINES_PER_OPERATION) {
    throw new HttpsError('invalid-argument', `${field} must contain between 1 and ${MAX_LINES_PER_OPERATION} lines.`);
  }
  return value as T[];
}

export function parseRequestLines(value: unknown): RequestLine[] {
  const lines = requireLineArray<Record<string, unknown>>(value, 'lines').map((line, index) => ({
    specId: requireString(line.specId, `lines[${index}].specId`, 200),
    requestedPcs: requirePieceCount(line.requestedPcs, `lines[${index}].requestedPcs`),
  }));
  ensureUnique(lines.map((line) => line.specId), 'Request specifications must be unique.');
  return lines;
}

export function parseIssuedLines(value: unknown): IssuedLineInput[] {
  const lines = requireLineArray<Record<string, unknown>>(value, 'issuedLines').map((line, index) => ({
    sourceLineIndex: requirePieceCount(line.sourceLineIndex, `issuedLines[${index}].sourceLineIndex`, true),
    specId: requireString(line.specId, `issuedLines[${index}].specId`, 200),
    issuedPcs: requirePieceCount(line.issuedPcs, `issuedLines[${index}].issuedPcs`, true),
    explanation: typeof line.explanation === 'string' ? line.explanation.trim().slice(0, 1000) : '',
  }));
  ensureUnique(lines.map((line) => String(line.sourceLineIndex)), 'A requested line may be fulfilled only once.');
  return lines;
}

export function parseReturnLines(value: unknown): ReturnLineInput[] {
  const lines = requireLineArray<Record<string, unknown>>(value, 'returnLines').map((line, index) => ({
    specId: requireString(line.specId, `returnLines[${index}].specId`, 200),
    returnedPcs: requirePieceCount(line.returnedPcs, `returnLines[${index}].returnedPcs`),
  }));
  ensureUnique(lines.map((line) => line.specId), 'Return specifications must be unique.');
  return lines;
}

export function parseBreakageLines(value: unknown, allowEmpty = true): BreakageLineInput[] {
  if (allowEmpty && (value === undefined || (Array.isArray(value) && value.length === 0))) return [];
  const lines = requireLineArray<Record<string, unknown>>(value, 'breakageLines').map((line, index) => ({
    specId: requireString(line.specId, `breakageLines[${index}].specId`, 200),
    pieces: requirePieceCount(line.pieces, `breakageLines[${index}].pieces`),
  }));
  ensureUnique(lines.map((line) => line.specId), 'Breakage specifications must be unique.');
  return lines;
}

export function roundCarats(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function caratsToMicros(value: number): number {
  return Math.round(value * 1_000_000);
}

function ensureUnique(values: string[], message: string): void {
  if (new Set(values).size !== values.length) throw new HttpsError('invalid-argument', message);
}
