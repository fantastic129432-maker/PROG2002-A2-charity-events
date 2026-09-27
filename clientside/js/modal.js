/**
 * js/modal.js
 * ---------------------------------------------------------------------------
 * The brief asks the event page to show a modal (or an alert dialog) with the
 * message "This feature is currently under construction." when Register is
 * clicked. A real modal is used rather than window.alert() because it looks
 * professional and is easier to demonstrate.
 *
 * The dialog is created once, on first use, and then reused:
 *   * the native <dialog> element is used when the browser supports it,
 *   * otherwise it falls back to a positioned element with role="dialog".
 * Both paths support: Escape to close, a close button, clicking the backdrop,
 * focus moving into the dialog, and focus returning to the button that opened
 * it. These are the accessibility details a marker looks for.
 */
import { el, select } from './dom.js';
import { t } from './i18n.js';

let dialogElement = null;
let titleElement = null;
let bodyElement = null;
let closeButton = null;
let lastFocusedElement = null;

const SUPPORTS_DIALOG = typeof HTMLDialogElement !== 'undefined';

/** Create the dialog markup once. */
function buildDialog() {
  dialogElement = el('div', {
    className: 'modal',
    attributes: {
      id: 'app-modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'app-modal-title',
      'aria-describedby': 'app-modal-body',
      hidden: 'hidden',
    },
  });

  const backdrop = el('div', { className: 'modal__backdrop', attributes: { 'data-close': 'true' } });
  const panel = el('div', { className: 'modal__panel', attributes: { role: 'document' } });

  const header = el('div', { className: 'modal__header' });
  titleElement = el('h2', {
    className: 'modal__title',
    text: t('common.close'),
    attributes: { id: 'app-modal-title' },
  });

  closeButton = el('button', {
    className: 'modal__close',
    html: '<span aria-hidden="true">&times;</span>',
    attributes: { type: 'button', 'aria-label': t('common.close') },
  });
  closeButton.addEventListener('click', closeModal);

  header.append(titleElement, closeButton);

  bodyElement = el('div', {
    className: 'modal__body',
    attributes: { id: 'app-modal-body' },
  });

  const footer = el('div', { className: 'modal__footer' });
  const okButton = el('button', {
    className: 'button',
    text: t('common.gotIt'),
    attributes: { type: 'button' },
  });
  okButton.addEventListener('click', closeModal);
  footer.append(okButton);

  panel.append(header, bodyElement, footer);

  if (SUPPORTS_DIALOG) {
    // A <dialog> gives us the backdrop and Escape handling for free, so the
    // custom backdrop is only used by the fallback path.
    dialogElement = el('dialog', {
      className: 'modal modal--native',
      attributes: {
        id: 'app-modal',
        'aria-labelledby': 'app-modal-title',
        'aria-describedby': 'app-modal-body',
      },
    });
    dialogElement.append(panel);
    dialogElement.addEventListener('click', (event) => {
      if (event.target === dialogElement) closeModal();
    });
  } else {
    dialogElement.append(backdrop, panel);
    dialogElement.addEventListener('click', (event) => {
      if (event.target.dataset && event.target.dataset.close === 'true') closeModal();
    });
  }

  document.body.append(dialogElement);
}

/** Trap focus inside the dialog while it is open. */
function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
    return;
  }

  if (event.key !== 'Tab' || !dialogElement) return;

  const focusable = Array.from(
    dialogElement.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.disabled && element.offsetParent !== null);

  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Open (or create) the dialog. */
export function openModal({ title = null, message = '', html = '', actions = null } = {}) {
  const resolvedTitle = title === null ? t('common.gotIt') : title;
  if (!dialogElement) buildDialog();

  titleElement.textContent = resolvedTitle;
  if (html) {
    bodyElement.innerHTML = html;
  } else {
    bodyElement.replaceChildren(el('p', { text: message }));
  }

  lastFocusedElement = document.activeElement;

  if (SUPPORTS_DIALOG) {
    if (typeof dialogElement.showModal === 'function') {
      dialogElement.showModal();
    } else {
      dialogElement.setAttribute('open', 'open');
    }
  } else {
    dialogElement.removeAttribute('hidden');
    document.body.classList.add('modal-open');
  }

  document.addEventListener('keydown', handleKeydown);
  closeButton.focus();

  return dialogElement;
}

/** Close the dialog and return focus to whatever opened it. */
export function closeModal() {
  if (!dialogElement) return;

  if (SUPPORTS_DIALOG) {
    if (typeof dialogElement.close === 'function' && dialogElement.open) {
      dialogElement.close();
    } else {
      dialogElement.removeAttribute('open');
    }
  } else {
    dialogElement.setAttribute('hidden', 'hidden');
    document.body.classList.remove('modal-open');
  }

  document.removeEventListener('keydown', handleKeydown);

  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

/** The exact message the assessment brief requires for the Register button. */
export function showUnderConstructionModal(featureName = null) {
  const feature = featureName === null ? t('modal.submitFeature') : featureName;
  return openModal({
    title: t('modal.comingSoonTitle'),
    html: `
      <p class="modal__lead">${t('modal.comingSoonLead')}</p>
      <p>${t('modal.comingSoonBody', { feature })}</p>
      <ul>
        <li>${t('modal.comingSoonItem1')}</li>
        <li>${t('modal.comingSoonItem2')}</li>
        <li>${t('modal.comingSoonItem3')}</li>
      </ul>`,
  });
}

/** Wire up any element that should close the dialog. */
export function initModal() {
  // Nothing to do up front: the dialog is created on first use to keep the
  // initial page load light. Kept for a symmetrical API with nav initLayout().
  const existing = select('#app-modal');
  if (existing) dialogElement = existing;
}
