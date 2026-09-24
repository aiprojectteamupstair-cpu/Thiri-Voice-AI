import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, stat, writeFile, unlink, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import PptxGenJS from 'pptxgenjs';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
export const outputDir = path.join(projectDir, 'Thiri Output');
const openScript = path.join(projectDir, 'scripts', 'open-item.ps1');
const inputScript = path.join(projectDir, 'scripts', 'control-input.ps1');
const clickElementScript = path.join(projectDir, 'scripts', 'click-element.ps1');

function safeName(name: string): string {
  const result = String(name || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/g, '').trim().slice(0, 80);
  if (!result || result === '.' || result === '..') throw new Error('A valid file name is required.');
  return result;
}

export function filePath(name: string): string {
  if (name !== path.basename(name)) throw new Error('Choose a file in Thiri Output.');
  return path.join(outputDir, safeName(name));
}

function uniqueName(title: string, extension: string): string {
  return `${safeName(title)}-${Date.now()}${extension}`;
}

async function openTarget(target: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', openScript, '-Target', target], {
      windowsHide: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error('Windows could not open the requested item.')));
  });
}

export async function createDocument(title: string, content: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const name = uniqueName(title, '.docx');
  const paragraphs = String(content || '').split(/\n+/).map((line) => new Paragraph({ text: line.trim(), spacing: { after: 180 } }));
  const document = new Document({ sections: [{ children: [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    ...paragraphs,
  ] }] });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(filePath(name), await Packer.toBuffer(document));
  await openTarget(filePath(name));
  return name;
}

export async function createTextFile(title: string, content: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const name = uniqueName(title, '.txt');
  await writeFile(filePath(name), content, 'utf8');
  await openTarget(filePath(name));
  return name;
}

export async function updateFile(name: string, content: string, slides?: Array<{ title: string; bullets: string[] }>): Promise<void> {
  const target = filePath(name);
  const extension = path.extname(target).toLowerCase();
  if (!['.txt', '.docx', '.pptx'].includes(extension) || !(await stat(target)).isFile()) throw new Error('Choose an existing file in Thiri Output.');
  if (extension === '.pptx' && !slides) throw new Error('Provide all replacement slides for the presentation.');
  if (extension !== '.pptx' && !content.trim()) throw new Error('Provide the complete replacement content.');
  const backup = `${target}.bak`;
  await copyFile(target, backup);
  try {
    if (extension === '.txt') await writeFile(target, content, 'utf8');
    else if (extension === '.docx') {
      const document = new Document({ sections: [{ children: [
        new Paragraph({ text: path.parse(name).name, heading: HeadingLevel.TITLE }),
        ...content.split(/\n+/).map((line) => new Paragraph({ text: line.trim(), spacing: { after: 180 } })),
      ] }] });
      await writeFile(target, await Packer.toBuffer(document));
    } else {
      const presentation = new PptxGenJS();
      presentation.layout = 'LAYOUT_WIDE';
      for (const item of slides!.slice(0, 12)) {
        const slide = presentation.addSlide();
        slide.addText(item.title, { x: 0.7, y: 0.5, w: 11.9, h: 0.8, fontSize: 28, bold: true });
        slide.addText(item.bullets.join('\n'), { x: 1, y: 1.6, w: 11.3, h: 5.1, fontSize: 20 });
      }
      await presentation.writeFile({ fileName: target });
    }
  } catch (error) {
    await copyFile(backup, target);
    throw error;
  } finally {
    await unlink(backup).catch(() => undefined);
  }
}

export async function deleteFile(name: string): Promise<void> {
  const target = filePath(name);
  if (!/\.(txt|docx|pptx)$/i.test(target) || !(await stat(target)).isFile()) throw new Error('Choose a file in Thiri Output.');
  await unlink(target);
}

export async function createPresentation(title: string, slides: Array<{ title: string; bullets: string[] }>): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const name = uniqueName(title, '.pptx');
  const presentation = new PptxGenJS();
  presentation.layout = 'LAYOUT_WIDE';
  presentation.author = 'Thiri';
  presentation.subject = title;
  const cover = presentation.addSlide();
  cover.background = { color: '111827' };
  cover.addText(title, { x: 0.8, y: 2.5, w: 11.7, h: 1.4, fontSize: 36, bold: true, color: 'FFFFFF', align: 'center' });
  for (const item of slides.slice(0, 12)) {
    const slide = presentation.addSlide();
    slide.background = { color: 'F8FAFC' };
    slide.addText(item.title, { x: 0.7, y: 0.45, w: 11.9, h: 0.8, fontSize: 28, bold: true, color: '1E293B' });
    slide.addText((item.bullets || []).slice(0, 6).map((bullet) => ({ text: bullet, options: { bullet: { indent: 20 }, breakLine: true } })), {
      x: 1, y: 1.6, w: 11.3, h: 5.1, fontSize: 20, color: '334155', breakLine: false, paraSpaceAfter: 16,
    });
  }
  await presentation.writeFile({ fileName: filePath(name) });
  await openTarget(filePath(name));
  return name;
}

export async function listFiles(): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  return (await readdir(outputDir)).filter((name) => /\.(txt|docx|pptx)$/i.test(name));
}

export async function openFile(name: string): Promise<void> {
  const target = filePath(name);
  if (!/\.(txt|docx|pptx)$/i.test(target) || !(await stat(target)).isFile()) throw new Error('Choose a file in Thiri Output.');
  await openTarget(target);
}

export async function renameFile(oldName: string, newName: string): Promise<string> {
  const original = filePath(oldName);
  const extension = path.extname(original).toLowerCase();
  if (!['.txt', '.docx', '.pptx'].includes(extension) || !(await stat(original)).isFile()) throw new Error('Choose a file in Thiri Output.');
  const renamed = `${safeName(path.parse(newName).name)}${extension}`;
  await rename(original, filePath(renamed));
  return renamed;
}

const apps: Record<string, string> = {
  word: 'WINWORD.EXE',
  powerpoint: 'POWERPNT.EXE',
  notepad: 'notepad.exe',
  calculator: 'calc.exe',
  explorer: 'explorer.exe',
};

export async function openApp(app: string): Promise<void> {
  const executable = apps[String(app).toLowerCase()];
  if (!executable) throw new Error('I can open Word, PowerPoint, Notepad, Calculator, or File Explorer.');
  await openTarget(executable);
}

export async function controlInput(command: { action: 'move' | 'click' | 'scroll' | 'type' | 'keys'; x?: number; y?: number; button?: string; steps?: number; text?: string; keys?: string }): Promise<void> {
  if (['move', 'click'].includes(command.action)) {
    if (!Number.isInteger(command.x) || !Number.isInteger(command.y)) throw new Error('Mouse coordinates must be whole numbers.');
    if (Math.abs(command.x!) > 10000 || Math.abs(command.y!) > 10000) throw new Error('Mouse coordinates are outside the desktop.');
  }
  if (command.action === 'type' && (!command.text || command.text.length > 2000)) throw new Error('Text must contain 1 to 2000 characters.');
  if (command.action === 'keys' && (!command.keys || command.keys.length > 50)) throw new Error('Unsupported keyboard command.');
  if (command.action === 'scroll' && (!Number.isInteger(command.steps) || Math.abs(command.steps!) > 20)) throw new Error('Scroll amount must be between -20 and 20.');

  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', inputScript], {
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let errorOutput = '';
    child.stderr.on('data', (chunk: Buffer) => { errorOutput += chunk.toString().slice(0, 500); });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(errorOutput.trim() || 'Could not control mouse or keyboard.')));
    child.stdin.end(JSON.stringify(command));
  });
}

export async function clickNamedElement(label: string): Promise<void> {
  if (!label.trim() || label.length > 100) throw new Error('Name a visible button or control.');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', clickElementScript, '-Name', label], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errorOutput = '';
    child.stderr.on('data', (chunk: Buffer) => { errorOutput += chunk.toString().slice(0, 500); });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(errorOutput.trim() || `Could not find ${label} in the active window.`)));
  });
}
