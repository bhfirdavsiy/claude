import crypto from 'node:crypto';
import fs from 'node:fs';

export function sha256Buffer(value               )         {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256File(file        )         {
  return sha256Buffer(fs.readFileSync(file));
}
