// Reconcile the existing tree: preserve charts, focus, drafts and open disclosures.
export function updateDOM(parent, markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  syncChildren(parent, template.content);
}

function key(node) { return node?.nodeType === 1 ? node.getAttribute('data-key') : null; }

function syncChildren(parent, next) {
  let current = parent.firstChild;
  for (const desired of [...next.childNodes]) {
    const desiredKey = key(desired);
    if (desiredKey && key(current) !== desiredKey) {
      const found = [...parent.childNodes].find(node => key(node) === desiredKey);
      if (found) { parent.insertBefore(found, current); current = found; }
      else { parent.insertBefore(desired.cloneNode(true), current); continue; }
    }
    if (!current) { parent.appendChild(desired.cloneNode(true)); continue; }
    if (current.nodeType !== desired.nodeType || current.nodeName !== desired.nodeName || key(current) !== desiredKey) {
      const inserted = desired.cloneNode(true);
      parent.insertBefore(inserted, current);
      continue;
    }
    const following = current.nextSibling;
    if (current.nodeType === 3 || current.nodeType === 8) {
      if (current.nodeValue !== desired.nodeValue) current.nodeValue = desired.nodeValue;
    } else if (current.nodeType === 1) {
      const editing = current === current.getRootNode().activeElement || current.hasAttribute('data-dirty');
      const preserve = name => (name === 'open' && current.localName === 'details') || (editing && ['value','data-dirty'].includes(name));
      for (const attr of [...current.attributes]) if (!preserve(attr.name) && !desired.hasAttribute(attr.name)) current.removeAttribute(attr.name);
      for (const attr of [...desired.attributes]) if (!preserve(attr.name) && current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
      if (!editing && current.localName === 'input' && desired.hasAttribute('value')) current.value = desired.getAttribute('value');
      syncChildren(current, desired);
      if (!editing && current.localName === 'select') current.value = desired.querySelector('option[selected]')?.value ?? desired.querySelector('option')?.value ?? '';
    }
    current = following;
  }
  while (current) { const following = current.nextSibling; parent.removeChild(current); current = following; }
}
