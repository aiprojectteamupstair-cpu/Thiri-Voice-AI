import { clickNamedElement, controlInput, createDocument, createPresentation, createTextFile, deleteFile, listFiles, openApp, openFile, renameFile, updateFile } from './desktopActions';

export const assistantTools = [
  {
    type: 'function',
    function: {
      name: 'create_document',
      description: 'Create and open a Word document when the user explicitly asks for a document, letter, report, or notes.',
      parameters: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string', description: 'Complete document text with paragraph breaks.' } }, required: ['title', 'content'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_presentation',
      description: 'Create and open a PowerPoint presentation when the user explicitly asks for slides or a presentation.',
      parameters: { type: 'object', properties: { title: { type: 'string' }, slides: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } } }, required: ['title', 'bullets'] } } }, required: ['title', 'slides'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_text_file',
      description: 'Create a plain text file in Thiri Output with complete user-requested content.',
      parameters: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } }, required: ['title', 'content'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_file',
      description: 'Replace the complete contents of an existing .txt or .docx file, or all slides of an existing .pptx file, in Thiri Output. Use only when the user supplies or requests complete replacement content; do not invent missing existing content.',
      parameters: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' }, slides: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } } }, required: ['title', 'bullets'] } } }, required: ['name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a specifically named file in Thiri Output only when the user explicitly asks to delete it.',
      parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List documents and presentations in the Thiri Output folder.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_file',
      description: 'Open an existing document or presentation in the Thiri Output folder.',
      parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: 'Rename an existing document or presentation in the Thiri Output folder.',
      parameters: { type: 'object', properties: { old_name: { type: 'string' }, new_name: { type: 'string' } }, required: ['old_name', 'new_name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_app',
      description: 'Open Word, PowerPoint, Notepad, Calculator, or File Explorer when the user asks.',
      parameters: { type: 'object', properties: { app: { type: 'string', enum: ['word', 'powerpoint', 'notepad', 'calculator', 'explorer'] } }, required: ['app'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'control_input',
      description: 'Perform one explicitly requested mouse or keyboard action on the Windows desktop. Click and move require coordinates given by the user. For a named button or control, use click_named_element instead.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['move', 'click', 'scroll', 'type', 'keys'] },
          x: { type: 'integer', description: 'Desktop X coordinate for move or click.' },
          y: { type: 'integer', description: 'Desktop Y coordinate for move or click.' },
          button: { type: 'string', enum: ['left', 'right'] },
          steps: { type: 'integer', description: 'Mouse wheel steps, positive to scroll up and negative to scroll down.' },
          text: { type: 'string', description: 'Literal text to type into the focused field.' },
          keys: { type: 'string', description: 'Keyboard shortcut such as Ctrl+S, Enter, or Alt+Tab.' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'click_named_element',
      description: 'Click a button or control named by the user in the active Windows app using local accessibility information. The name must come from the user. No screenshot is sent anywhere.',
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'The user-specified button or control name.' } }, required: ['name'] },
    },
  },
];

export async function executeAssistantTool(name: string, argumentsJson: string, language: 'my' | 'en'): Promise<{ text: string; fileName?: string }> {
  const args = JSON.parse(argumentsJson || '{}') as Record<string, unknown>;
  const burmese = language === 'my';
  switch (name) {
    case 'create_text_file': {
      const fileName = await createTextFile(String(args.title || 'Notes'), String(args.content || ''));
      return { text: burmese ? `${fileName} ဖိုင်ကို ဖန်တီးထားပါပြီရှင်။` : `I created ${fileName}.`, fileName };
    }
    case 'update_file': {
      const fileName = String(args.name || '');
      const slides = Array.isArray(args.slides) ? args.slides.slice(0, 12).map((slide: any) => ({ title: String(slide.title || 'Slide').slice(0, 100), bullets: Array.isArray(slide.bullets) ? slide.bullets.slice(0, 6).map((bullet: unknown) => String(bullet).slice(0, 400)) : [] })) : undefined;
      await updateFile(fileName, String(args.content || ''), slides);
      return { text: burmese ? `${fileName} ကို ပြင်ဆင်ထားပါပြီရှင်။` : `I updated ${fileName}.`, fileName };
    }
    case 'delete_file': {
      const fileName = String(args.name || '');
      await deleteFile(fileName);
      return { text: burmese ? `${fileName} ကို ဖျက်ထားပါပြီရှင်။` : `I deleted ${fileName}.` };
    }
    case 'create_document': {
      const fileName = await createDocument(String(args.title || 'Document'), String(args.content || '').slice(0, 10000));
      return { text: burmese ? `${fileName} Word ဖိုင်ကို ဖန်တီးပြီး ဖွင့်ထားပါပြီရှင်။` : `I created and opened the Word document ${fileName}.`, fileName };
    }
    case 'create_presentation': {
      const slides = Array.isArray(args.slides) ? args.slides.slice(0, 12).map((slide: any) => ({ title: String(slide.title || 'Slide').slice(0, 100), bullets: Array.isArray(slide.bullets) ? slide.bullets.slice(0, 6).map((bullet: unknown) => String(bullet).slice(0, 400)) : [] })) : [];
      const fileName = await createPresentation(String(args.title || 'Presentation'), slides);
      return { text: burmese ? `${fileName} PowerPoint ဖိုင်ကို ဖန်တီးပြီး ဖွင့်ထားပါပြီရှင်။` : `I created and opened the PowerPoint presentation ${fileName}.`, fileName };
    }
    case 'list_files': {
      const files = await listFiles();
      return { text: files.length ? burmese ? `Thiri Output ထဲမှာ ${files.join(', ')} ရှိပါတယ်ရှင်။` : `Files in Thiri Output: ${files.join(', ')}` : burmese ? 'Thiri Output ဖိုလ်ဒါမှာ ဖိုင်မရှိသေးပါရှင်။' : 'The Thiri Output folder is empty.' };
    }
    case 'open_file':
      await openFile(String(args.name || ''));
      return { text: burmese ? `${args.name} ကို ဖွင့်ထားပါပြီရှင်။` : `I opened ${args.name}.` };
    case 'rename_file': {
      const renamed = await renameFile(String(args.old_name || ''), String(args.new_name || ''));
      return { text: burmese ? `ဖိုင်အမည်ကို ${renamed} လို့ ပြောင်းထားပါပြီရှင်။` : `I renamed the file to ${renamed}.`, fileName: renamed };
    }
    case 'open_app':
      await openApp(String(args.app || ''));
      return { text: burmese ? `${args.app} ကို ဖွင့်ထားပါပြီရှင်။` : `I opened ${args.app}.` };
    case 'control_input': {
      const action = String(args.action || '') as 'move' | 'click' | 'scroll' | 'type' | 'keys';
      if (!['move', 'click', 'scroll', 'type', 'keys'].includes(action)) throw new Error('Unsupported mouse or keyboard action.');
      await controlInput({
        action,
        x: typeof args.x === 'number' ? args.x : undefined,
        y: typeof args.y === 'number' ? args.y : undefined,
        button: typeof args.button === 'string' ? args.button : 'left',
        steps: typeof args.steps === 'number' ? args.steps : undefined,
        text: typeof args.text === 'string' ? args.text : undefined,
        keys: typeof args.keys === 'string' ? args.keys : undefined,
      });
      return { text: burmese ? 'ခိုင်းထားတဲ့ mouse သို့မဟုတ် keyboard လုပ်ဆောင်ချက်ကို ပြီးစီးပါပြီရှင်။' : 'I completed the mouse or keyboard action.' };
    }
    case 'click_named_element': {
      const label = String(args.name || '');
      await clickNamedElement(label);
      return { text: burmese ? `${label} ကို နှိပ်ထားပါပြီရှင်။` : `I clicked ${label}.` };
    }
    default:
      throw new Error('Unsupported computer action.');
  }
}
