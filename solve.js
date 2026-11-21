// Fast drop-in for make.fun's csv-reader 1.0.0: run(input) returns exactly
// csv-reader's answer {columns, rows, errors} for {text, header}, faster.
//
// How it stays identical: the reference reads one character at a time; this
// reader jumps with indexOf instead and follows the reference step for step:
// BOM dropped, blank lines no records, a lone CR outside quotes dropped
// (stray_cr), a quoted field runs to the next undoubled quote with "" as one
// quote and CR/CRLF inside as LF, junk after a closing quote appended as it
// stands (quote_junk), a quote that never closes read as a literal with the
// rest re-read unquoted (unterminated_quote), quotes inside unquoted fields
// literal, fields kept as strings, records padded (short_row) or cut
// (long_row) to the first record's width, errors {code, line, row} in the
// order met.
//
// Where the speed comes from: the line end is tracked across a record, so an
// unquoted field needs a single indexOf (for the next comma) and one slice;
// quoted fields jump to the next quote with indexOf; a field is returned as
// the slice itself instead of a concatenation; and the slow stray-CR path
// runs only for the rare field that holds one.

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const len = text.length;
  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and its index in rows (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // How the last field read ended: 0 comma, 1 line break, 2 end of text.
  let fEnded = 0;
  // Characters the last readUnquoted call kept (the junk test needs it).
  let fAdded = 0;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break,
  // dropping a CR not followed by LF (stray_cr). Returns the field; fEnded and
  // fAdded say how it ended and how many characters this call kept. Used for
  // the text after a closing quote and after a quote that never closes.
  function readUnquoted(value) {
    let added = 0;
    const c = text.indexOf(',', pos);
    const nl = text.indexOf('\n', pos);
    let end;
    let isComma;
    if (c !== -1 && (nl === -1 || c < nl)) {
      end = c;
      isComma = true;
    } else if (nl !== -1) {
      end = nl;
      isComma = false;
    } else {
      end = len;
      isComma = false;
    }
    const seg = text.slice(pos, end);
    const r = seg.indexOf('\r');
    if (r === -1) {
      if (isComma) {
        pos = end + 1;
        fEnded = 0;
      } else if (nl !== -1) {
        pos = end + 1;
        line += 1;
        fEnded = 1;
      } else {
        pos = len;
        fEnded = 2;
      }
      fAdded = added + seg.length;
      return value === '' ? seg : value + seg;
    }
    if (!isComma && nl !== -1 && r === seg.length - 1) {
      // The only CR sits right before the LF: a CRLF line break.
      pos = end + 1;
      line += 1;
      fEnded = 1;
      fAdded = added + seg.length - 1;
      return value === '' ? seg.slice(0, -1) : value + seg.slice(0, -1);
    }
    // Stray CRs inside the field: drop each (stray_cr) and keep the rest.
    let v = value;
    let i = 0;
    let segEnd = seg.length;
    if (!isComma && nl !== -1 && seg.length > 0 && seg.charCodeAt(seg.length - 1) === 13) {
      segEnd = seg.length - 1; // a trailing CR before the LF is the CRLF
    }
    for (;;) {
      const cr = seg.indexOf('\r', i);
      if (cr === -1 || cr >= segEnd) {
        const tail = seg.slice(i, segEnd);
        v = v === '' ? tail : v + tail;
        added += tail.length;
        break;
      }
      const tail = seg.slice(i, cr);
      v = v === '' ? tail : v + tail;
      added += tail.length;
      error('stray_cr');
      i = cr + 1;
    }
    if (isComma) {
      pos = end + 1;
      fEnded = 0;
    } else if (nl !== -1) {
      pos = end + 1;
      line += 1;
      fEnded = 1;
    } else {
      pos = len;
      fEnded = 2;
    }
    fAdded = added;
    return v;
  }

  // The value of a segment holding stray CRs: each dropped (stray_cr), the
  // rest kept.
  function strayField(value, seg) {
    let v = value;
    let i = 0;
    let added = 0;
    for (;;) {
      const cr = seg.indexOf('\r', i);
      if (cr === -1) {
        const tail = seg.slice(i);
        v = v === '' ? tail : v + tail;
        added += tail.length;
        break;
      }
      const tail = seg.slice(i, cr);
      v = v === '' ? tail : v + tail;
      added += tail.length;
      error('stray_cr');
      i = cr + 1;
    }
    fAdded = added;
    return v;
  }

  // A quoted segment with each CRLF or lone CR read as LF, counting the line
  // breaks it holds. Most segments hold none, so this stays cheap.
  function quotedSeg(s) {
    if (s.indexOf('\r') === -1) {
      if (s.indexOf('\n') === -1) return s;
      let k = 0;
      let i = -1;
      while ((i = s.indexOf('\n', i + 1)) !== -1) k++;
      line += k;
      return s;
    }
    const t = s.replace(/\r\n?/g, '\n');
    let k = 0;
    let i = -1;
    while ((i = t.indexOf('\n', i + 1)) !== -1) k++;
    line += k;
    return t;
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        const qs = quotedSeg(text.slice(pos, q));
        value = value === '' ? qs + '"' : value + qs + '"';
        pos = q + 2;
        continue;
      }
      const qs = quotedSeg(text.slice(pos, q));
      value = value === '' ? qs : value + qs;
      pos = q + 1;
      break;
    }
    if (pos >= len) {
      fEnded = 2;
      fAdded = 0;
      return value;
    }
    const ch = text.charCodeAt(pos);
    if (ch === 44) {
      pos += 1;
      fEnded = 0;
      fAdded = 0;
      return value;
    }
    if (ch === 10) {
      pos += 1;
      line += 1;
      fEnded = 1;
      fAdded = 0;
      return value;
    }
    if (ch === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fEnded = 1;
      fAdded = 0;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    const v = readUnquoted(value);
    if (fAdded > 0) error('quote_junk');
    return v;
  }

  // Finishes a record: pads or cuts it to the first record's width, or keeps
  // it as the header. A record of one empty unquoted field is no record.
  function finishRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const ch = text.charCodeAt(pos);
      if (ch === 10) {
        pos += 1;
        line += 1;
      } else if (ch === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Read field by field, as the reference does. The line end is tracked
    // across the record, so an unquoted field needs one indexOf (the comma).
    const fields = [];
    let quoted = false;
    let lineEnd = text.indexOf('\n', pos);
    let lineEndIsEof = lineEnd === -1;
    if (lineEndIsEof) lineEnd = len;
    for (;;) {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) {
        fields.push(readQuoted());
        if (pos > lineEnd) {
          lineEnd = text.indexOf('\n', pos);
          lineEndIsEof = lineEnd === -1;
          if (lineEndIsEof) lineEnd = len;
        }
      } else {
        const c = text.indexOf(',', pos);
        if (c !== -1 && c < lineEnd) {
          const seg = text.slice(pos, c);
          if (seg.indexOf('\r') === -1) {
            fields.push(seg);
            pos = c + 1;
            fEnded = 0;
          } else {
            fields.push(strayField('', seg));
            pos = c + 1;
            fEnded = 0;
          }
        } else {
          const seg = text.slice(pos, lineEnd);
          if (seg.indexOf('\r') === -1) {
            fields.push(seg);
            if (lineEndIsEof) {
              pos = len;
              fEnded = 2;
            } else {
              pos = lineEnd + 1;
              line += 1;
              fEnded = 1;
            }
          } else if (!lineEndIsEof && seg.charCodeAt(seg.length - 1) === 13) {
            fields.push(strayField('', seg.slice(0, -1)));
            pos = lineEnd + 1;
            line += 1;
            fEnded = 1;
          } else {
            fields.push(strayField('', seg));
            if (lineEndIsEof) {
              pos = len;
              fEnded = 2;
            } else {
              pos = lineEnd + 1;
              line += 1;
              fEnded = 1;
            }
          }
        }
      }
      if (fEnded !== 0) break;
    }
    finishRecord(fields, quoted);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
