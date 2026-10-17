import {settings, schema, presets, setSetting, applyPreset, resetSettings, persistSettings} from './movement-settings.js';

export function createMovementPanel(onChange = () => {}, onOpen = () => {}) {
  const trigger = document.getElementById('movement-toggle');
  const panel = document.getElementById('movement-panel');
  if (!trigger || !panel) throw new Error('Movement panel markup is missing.');
  const content = panel.querySelector('.movement-fields');
  const notice = panel.querySelector('.movement-save-status');
  const keyBehavior = document.getElementById('key-ad-description');
  const controls = new Map();
  const removers = [];
  const listen = (element,event,fn) => { element.addEventListener(event,fn); removers.push(() => element.removeEventListener(event,fn)); };
  const format = (item,value) => `${value}${item.unit ? ` ${item.unit}` : ''}`;
  let group = null;

  // Control feel: three presets above the individual sliders. Each sets a handful of them at once; moving one of those afterwards reads as 'Custom'.
  const presetBox = document.createElement('fieldset'), presetRow = document.createElement('div'), presetNote = document.createElement('p'), presetButtons = new Map();
  presetBox.className = 'movement-presets'; presetRow.className = 'movement-preset-row'; presetNote.className = 'movement-preset-note'; presetNote.id = 'movement-preset-note';
  const legend = document.createElement('legend'); legend.textContent = 'Control feel'; presetBox.append(legend, presetRow, presetNote);
  for (const [name, preset] of Object.entries(presets)) {
    const button = Object.assign(document.createElement('button'), {type:'button', textContent:preset.label});
    button.dataset.preset = name; button.setAttribute('aria-describedby', presetNote.id);
    presetRow.append(button); presetButtons.set(name, button);
    listen(button, 'click', () => {
      applyPreset(name); refresh();
      notice.textContent = persistSettings() ? `${preset.label} feel · saved on this device` : `${preset.label} feel · browser storage unavailable`;
      onChange(null,null,settings);
    });
  }
  content.append(presetBox);
  function refreshPreset() {
    for (const [name, button] of presetButtons) button.setAttribute('aria-pressed', String(settings.preset === name));
    presetNote.textContent = presets[settings.preset]?.description ?? 'Custom: tuned with the sliders below.';
  }

  for (const item of schema) {
    const general = item.group === 'Lighting' ? document.getElementById('general-brightness') : null;
    if (!general && group?.dataset.group !== item.group) {
      group = document.createElement('details');
      group.dataset.group = item.group;
      group.open = item.group === 'Lighting';
      const summary = document.createElement('summary');
      summary.textContent = item.group;
      group.append(summary);
      content.append(group);
    }
    const row = document.createElement('div');
    row.className = `movement-field movement-field-${item.type}`;
    const label = document.createElement('label');
    label.htmlFor = `movement-${item.key}`;
    label.textContent = item.label;
    row.append(label);
    let input, range, output;
    if (item.type === 'number') {
      output = document.createElement('output');
      output.htmlFor = `movement-${item.key} movement-${item.key}-number`;
      output.className = 'movement-output';
      row.append(output);
      const track = document.createElement('div');
      track.className = 'movement-number-controls';
      range = document.createElement('input');
      range.type = 'range';
      input = document.createElement('input');
      input.type = 'number';
      input.inputMode = 'decimal';
      for (const field of [range,input]) {
        field.min = item.min;
        field.max = item.max;
        field.step = item.step;
        field.setAttribute('aria-label',item.label);
      }
      range.id = `movement-${item.key}`;
      input.id = `movement-${item.key}-number`;
      track.append(range,input);
      row.append(track);
    } else if (item.type === 'select') {
      input = document.createElement('select');
      for (const option of item.options) {
        const element = document.createElement('option');
        element.value = option.value;
        element.textContent = option.label;
        input.append(element);
      }
    } else {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'movement-switch';
    }
    if (item.type !== 'number') { input.id = `movement-${item.key}`; row.append(input); }
    if (item.description) {
      const description = document.createElement('p');
      description.id = `movement-${item.key}-help`;
      description.textContent = item.description;
      row.append(description);
      input.setAttribute('aria-describedby',description.id);
      range?.setAttribute('aria-describedby',description.id);
    }
    (general || group).append(row);
    const refresh = (keepNumberDraft = false) => {
      if (item.type === 'boolean') input.checked = settings[item.key];
      else if (!keepNumberDraft) input.value = settings[item.key];
      if (range) {
        range.value = settings[item.key];
        range.setAttribute('aria-valuetext',format(item,settings[item.key]));
        output.value = format(item,settings[item.key]);
      }
    };
    const update = source => {
      if (item.type === 'number' && (source.value.trim() === '' || !Number.isFinite(source.valueAsNumber))) return;
      const value = item.type === 'boolean' ? input.checked : item.type === 'number' ? source.valueAsNumber : input.value;
      setSetting(item.key,value);
      refresh(source === input && item.type === 'number');
      refreshPreset();
      refreshKeymap();
      notice.textContent = persistSettings() ? 'Saved on this device · changes apply live' : 'Changes apply live · browser storage unavailable';
      onChange(item.key,settings[item.key],settings);
      window.dispatchEvent(new CustomEvent('oceanmovementchange',{detail:{key:item.key}}));
    };
    listen(input,item.type === 'number' ? 'input' : 'change',() => update(input));
    if (range) listen(range,'input',() => update(range));
    if (item.type === 'number') listen(input,'blur',() => refresh());
    controls.set(item.key,refresh);
    refresh();
  }
  refreshPreset();

  function refreshKeymap() { if (keyBehavior) keyBehavior.textContent = settings.keyboardMode === 'turn' ? 'Turn' : 'Strafe'; }
  function refresh() { for (const fn of controls.values()) fn(); refreshPreset(); refreshKeymap(); window.dispatchEvent(new CustomEvent('oceanmovementchange')); }
  refreshKeymap();
  let open = false;
  function syncOpen() {
    const next = panel.open;
    trigger.setAttribute('aria-expanded', String(next));
    if (next === open) return;
    open = next;
    if (open && document.pointerLockElement) document.exitPointerLock();
    if (open) refresh();
    document.body.toggleAttribute('data-movement-panel', open);
    if (open) document.body.dataset.movementPanel = 'open';
    onOpen(open);
  }
  function close() { panel.open = false; syncOpen(); }
  function show() { panel.open = true; syncOpen(); }
  listen(panel,'toggle',syncOpen);
  listen(panel.querySelector('.movement-reset'),'click',() => {
    resetSettings();
    refresh();
    notice.textContent = persistSettings() ? 'Defaults restored · saved on this device' : 'Defaults restored · browser storage unavailable';
    onChange(null,null,settings);
  });
  listen(panel.querySelector('.movement-export'),'click',() => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(settings,null,2)],{type:'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ocean-movement-settings.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000);
    notice.textContent = 'Settings exported as JSON';
  });
  notice.textContent = persistSettings() ? 'Saved on this device · changes apply live' : 'Changes apply live · browser storage unavailable';
  return {open:show,close,refresh,get isOpen(){ return open; },destroy(){ close(); for (const remove of removers) remove(); content.replaceChildren(); }};
}
