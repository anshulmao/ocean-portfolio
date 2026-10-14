import {settings, schema, presets, setSetting, applyPreset, resetSettings, persistSettings} from './movement-settings.js';

export function createMovementPanel(onChange = () => {}, onOpen = () => {}) {
  const trigger = document.getElementById('movement-toggle');
  const panel = document.getElementById('movement-panel');
  if (!trigger || !panel) throw new Error('Movement panel markup is missing.');
  const content = panel.querySelector('.movement-fields');
  const notice = panel.querySelector('.movement-save-status');
  const controls = new Map();
  let restoreFocus = trigger;
  let open = false;
  const inertBefore = new Map();
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
    if (group?.dataset.group !== item.group) {
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
    group.append(row);
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
      notice.textContent = persistSettings() ? 'Saved on this device · changes apply live' : 'Changes apply live · browser storage unavailable';
      onChange(item.key,settings[item.key],settings);
    };
    listen(input,item.type === 'number' ? 'input' : 'change',() => update(input));
    if (range) listen(range,'input',() => update(range));
    if (item.type === 'number') listen(input,'blur',() => refresh());
    controls.set(item.key,refresh);
    refresh();
  }
  refreshPreset();

  function refresh() { for (const fn of controls.values()) fn(); refreshPreset(); }
  function close() {
    if (!open) return;
    open = false;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded','false');
    document.body.removeAttribute('data-movement-panel');
    for (const [element,wasInert] of inertBefore) element.inert=wasInert;
    inertBefore.clear();
    onOpen(false);
    // The trigger lives in the settings menu, which closes when this panel opens: fall back to the menu button.
    const focusTarget=restoreFocus?.isConnected && restoreFocus.getClientRects().length ? restoreFocus : document.getElementById('menu-toggle') || trigger;
    focusTarget.focus({preventScroll:true});
    // In short viewports the trigger was hidden behind the sheet. Wait for
    // its visibility to return before restoring focus on Chromium touch views.
    requestAnimationFrame(()=>{if(!open&&(document.activeElement===document.body||panel.contains(document.activeElement)))focusTarget.focus({preventScroll:true});});
  }
  function show() {
    if (open) return;
    restoreFocus = trigger;
    open = true;
    if (document.pointerLockElement) document.exitPointerLock();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded','true');
    document.body.dataset.movementPanel = 'open';
    for (const element of document.body.children) {
      if(element===panel||element===trigger||element.tagName==='SCRIPT')continue;
      inertBefore.set(element,element.inert);element.inert=true;
    }
    refresh();
    onOpen(true);
    panel.querySelector('.movement-close').focus({preventScroll:true});
  }
  listen(trigger,'click',() => open ? close() : show());
  listen(panel.querySelector('.movement-close'),'click',close);
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
  listen(document,'keydown',event => {
    if (!open) return;
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
    if (panel.contains(event.target)) event.stopPropagation();
    if (event.key === 'Tab') {
      const focusable = [...panel.querySelectorAll('button,input,select,summary')].filter(element => element.getClientRects().length && !element.disabled);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  notice.textContent = persistSettings() ? 'Saved on this device · changes apply live' : 'Changes apply live · browser storage unavailable';
  return {open:show,close,refresh,get isOpen(){ return open; },destroy(){ close(); for (const remove of removers) remove(); content.replaceChildren(); }};
}
