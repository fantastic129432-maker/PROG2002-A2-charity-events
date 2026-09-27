/**
 * js/event.js
 * ---------------------------------------------------------------------------
 * Event detail page controller.
 *
 * Required behaviour from the assessment brief, and where it happens here:
 *   * "only displays the details for the specific event selected from the Home
 *      or Search pages ... utilise URL query strings or Local Storage to pass
 *      the event id and fetch the correct data via your API"
 *        -> readEventIdFromUrl() reads ?id=7; the last id the visitor opened is
 *           also remembered in localStorage as a fallback, so the page still
 *           works if the query string is lost.
 *   * "display all relevant event details retrieved from your API with a
 *      professional and engaging layout"
 *        -> renderEvent() builds the hero, the facts list, the full
 *           description, the purpose and the organisation panel.
 *   * "ticket information (the price, or even a free one)"
 *        -> renderTickets() lists every ticket tier and marks free tiers.
 *   * "Goal vs. Progress (for a specific charity goal)"
 *        -> dom.js progressBar() draws the goal against the donations total.
 *   * "Include a Register button ... trigger a simple modal or alert dialog
 *      stating 'This feature is currently under construction.'"
 *        -> the button calls modal.js showUnderConstructionModal().
 */
import { getEventById, ApiError } from './api.js';
import { initLayout } from './nav.js';
import {
  el,
  select,
  imageUrl,
  stateBadge,
  progressBar,
  formatDate,
  formatDateRange,
  formatTime,
  formatPrice,
  formatCurrency,
  showError,
} from './dom.js';
import { showUnderConstructionModal } from './modal.js';

const STORAGE_KEY = 'charity-events:last-viewed-event-id';

/* ------------------------------------------------------------------ */
/* Startup                                                             */
/* ------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  initLayout();

  const eventId = readEventId();

  if (!eventId) {
    renderMissingId();
    return;
  }

  loadEvent(eventId);
});

/* ------------------------------------------------------------------ */
/* Reading the event id                                                */
/* ------------------------------------------------------------------ */

/**
 * Get the event id, preferring the query string (the method the brief
 * suggests) and falling back to localStorage.
 */
function readEventId() {
  const fromQuery = new URLSearchParams(window.location.search).get('id');

  if (fromQuery !== null && fromQuery !== '') {
    // Remember it for a later visit without the query string.
    try {
      window.localStorage.setItem(STORAGE_KEY, fromQuery);
    } catch (error) {
      // Private browsing can block localStorage; the query string still works.
    }
    return fromQuery;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // Put the id back into the address bar so the URL stays shareable.
      window.history.replaceState({}, '', `?id=${encodeURIComponent(stored)}`);
      return stored;
    }
  } catch (error) {
    // ignore
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Loading and rendering                                               */
/* ------------------------------------------------------------------ */
async function loadEvent(eventId) {
  const root = select('#event-root');

  try {
    const event = await getEventById(eventId);
    renderEvent(event);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      showError(root, error.message, [
        'The event may have been suspended by the organisation, or the link may be out of date.',
      ]);
    } else {
      showError(
        root,
        error.friendlyMessage || 'The event details could not be loaded.',
        error.details
      );
    }
    appendBackLink(root);
  }
}

/** Build the complete page for one event. */
function renderEvent(event) {
  const root = select('#event-root');

  document.title = `${event.eventName} | Unity Heart Foundation`;
  select('#breadcrumb-event').textContent = event.eventName;

  root.replaceChildren(
    buildHero(event),
    buildDetailSection(event)
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */
function buildHero(event) {
  const section = el('section', { className: 'event-hero' });
  const container = el('div', { className: 'container' });
  const grid = el('div', { className: 'event-hero__grid' });

  /* --- left: the headline facts ---------------------------------- */
  const copy = el('div');

  const meta = el('div', { className: 'event-hero__meta' });
  meta.append(stateBadge(event.eventState));
  meta.append(
    el('span', {
      className: 'chip',
      text: event.categoryName || 'Charity event',
    })
  );
  meta.append(
    el('span', {
      className: 'price',
      text: priceSummary(event),
    })
  );

  const title = el('h1', { text: event.eventName });

  const lead = el('p', { className: 'event-hero__lead', text: event.shortDescription });

  const facts = el('ul', { className: 'fact-list' });
  [
    ['Date', formatDate(event.dateStart)],
    ['Time', `${formatTime(event.startTime)} - ${formatTime(event.endTime)}`],
    [
      'Venue',
      `${event.venueName}${event.address && event.address !== 'N/A' ? `, ${event.address}` : ''}`,
    ],
    ['Location', `${event.city} ${event.state || ''} ${event.postcode || ''}`.trim()],
    ['Organised by', event.organizationName],
    ['Capacity', event.capacity ? `${event.capacity} places` : 'Not limited'],
  ].forEach(([label, value]) => {
    const item = el('li');
    item.append(
      el('span', { className: 'fact-list__label', text: label }),
      el('span', { className: 'fact-list__value', text: value })
    );
    facts.append(item);
  });

  copy.append(meta, title, lead, facts);

  /* --- right: image ---------------------------------------------- */
  const media = el('div', { className: 'event-hero__media' });
  media.append(
    el('img', {
      attributes: {
        src: imageUrl(event),
        alt: `Illustration for ${event.eventName}`,
        width: '720',
        height: '450',
      },
    })
  );

  grid.append(copy, media);
  container.append(grid);
  section.append(container);
  return section;
}

/** "Free entry", "From $20.00" or "Tickets from $20.00 to $480.00". */
function priceSummary(event) {
  const prices = (event.ticketTypes || []).map((ticket) => ticket.price);

  if (event.isFree || (prices.length > 0 && prices.every((price) => price === 0))) {
    return 'Free entry';
  }
  if (prices.length === 0) {
    return 'Contact the organiser for ticket prices';
  }

  const min = Math.min(...prices.filter((price) => price > 0));
  const max = Math.max(...prices);
  if (min === max) return `Tickets ${formatPrice(min)}`;
  return `Tickets from ${formatPrice(min)} to ${formatPrice(max)}`;
}

/* ------------------------------------------------------------------ */
/* Main content + sidebar                                              */
/* ------------------------------------------------------------------ */
function buildDetailSection(event) {
  const container = el('div', { className: 'container' });
  const grid = el('div', { className: 'detail-grid' });

  grid.append(buildProse(event), buildSideColumn(event));
  container.append(grid);
  return container;
}

/** Full description, purpose and organiser information. */
function buildProse(event) {
  const prose = el('div', { className: 'prose' });

  prose.append(el('h2', { text: 'About this event' }));
  // The description is one paragraph per blank line, so a long text stays
  // readable without trusting it as HTML.
  event.description
    .split(/\n+/)
    .filter((paragraph) => paragraph.trim() !== '')
    .forEach((paragraph) => {
      prose.append(el('p', { text: paragraph.trim() }));
    });

  prose.append(el('h2', { text: 'Why we are fundraising' }));
  prose.append(el('p', { text: event.purpose }));

  prose.append(el('h2', { text: 'How the funds are used' }));
  const uses = el('ul');
  [
    'Ticket income is recorded against this event and reported openly.',
    'Donations are held by the organisation and released to the named program.',
    'Running costs are covered by sponsors and volunteers, not by your ticket.',
  ].forEach((line) => uses.append(el('li', { text: line })));
  prose.append(uses);

  prose.append(el('h2', { text: 'Accessibility and inclusion' }));
  prose.append(
    el('p', {
      text:
        'Please contact the organiser if you need a support person, an accessible ' +
        'viewing area, a quiet space, or information in another format. We will do ' +
        'our best to accommodate every request.',
    })
  );

  prose.append(el('h2', { text: 'Event status' }));
  prose.append(
    el('p', {
      text:
        event.eventState === 'past'
          ? `This event finished on ${formatDate(event.dateEnd)}. It is kept online so the results and the funds raised remain visible.`
          : event.eventState === 'ongoing'
            ? 'This event is taking place today.'
            : `This event takes place on ${formatDateRange(event)}. Registration details will open closer to the date.`,
    })
  );

  return prose;
}

/** Registration, tickets and the goal progress bar. */
function buildSideColumn(event) {
  const column = el('div', { className: 'side-column' });

  column.append(
    buildGoalPanel(event),
    buildTicketPanel(event),
    buildOrganiserPanel(event)
  );

  return column;
}

/** Goal vs progress - the fundraising goal against the donations recorded. */
function buildGoalPanel(event) {
  const panel = el('div', { className: 'panel panel--brand' });
  panel.append(el('h2', { text: 'Goal vs progress' }));
  panel.append(
    el('p', {
      text: `Help ${event.organizationName} reach the goal for this event.`,
    })
  );
  panel.append(progressBar(event));

  const summary = el('ul', { className: 'contact-list' });
  [
    ['Goal', formatCurrency(event.goalAmount)],
    ['Raised', formatCurrency(event.raisedAmount)],
    ['Still needed', formatCurrency(Math.max(event.goalAmount - event.raisedAmount, 0))],
    ['Donations', `${event.donationCount || 0} recorded`],
  ].forEach(([label, value]) => {
    const item = el('li');
    item.append(el('span', { text: label }), el('span', { text: value }));
    summary.append(item);
  });
  panel.append(summary);

  return panel;
}

/** Ticket tiers, the Register button and the (A3) registration form. */
function buildTicketPanel(event) {
  const panel = el('div', { className: 'panel panel--accent' });
  panel.append(el('h2', { text: 'Ticket information' }));

  const tickets = event.ticketTypes || [];

  if (tickets.length === 0) {
    panel.append(
      el('p', {
        text: 'Ticket prices for this event have not been published yet. Please contact the organiser.',
      })
    );
  } else {
    const list = el('ul', { className: 'ticket-list' });
    tickets.forEach((ticket) => {
      const item = el('li', {
        className: ticket.price === 0 ? 'ticket ticket--free' : 'ticket',
      });

      const name = el('span', { className: 'ticket__name', text: ticket.ticketName });
      if (ticket.description) {
        name.append(el('span', { className: 'ticket__desc', text: ticket.description }));
      }
      if (ticket.quantityAvailable !== null && ticket.quantityAvailable !== undefined) {
        name.append(
          el('span', {
            className: 'ticket__availability',
            text:
              ticket.quantityAvailable > 0
                ? `${ticket.quantityAvailable} available`
                : 'Sold out',
          })
        );
      }

      item.append(
        name,
        el('span', {
          className: 'ticket__price',
          text: ticket.price === 0 ? 'Free' : formatPrice(ticket.price),
        })
      );
      list.append(item);
    });
    panel.append(list);
  }

  const registerButton = el('button', {
    className: 'button button--block',
    text: event.eventState === 'past' ? 'Registration closed' : 'Register',
    attributes: {
      type: 'button',
      id: 'register-button',
      'aria-haspopup': 'dialog',
    },
  });
  registerButton.addEventListener('click', () => {
    // The exact message required by the brief is produced inside modal.js.
    showUnderConstructionModal(`Registering for ${event.eventName}`);
  });
  panel.append(registerButton);

  panel.append(buildRegistrationForm(event));

  panel.append(
    el('p', {
      className: 'register-note',
      text:
        'Registering and paying for tickets online is being built in Assessment 3. ' +
        'The form above shows the fields that will be validated on the server.',
    })
  );

  return panel;
}

/**
 * A registration form that demonstrates the layout AND the client-side
 * validation pattern. It deliberately does not send anything yet, because
 * Assessment 2 only requires GET endpoints.
 */
function buildRegistrationForm(event) {
  const wrapper = el('div', { className: 'registration-form' });
  wrapper.append(el('h3', { text: 'Registration details' }));

  const form = el('form', { attributes: { id: 'registration-form', novalidate: 'novalidate' } });

  const row = el('div', { className: 'form-row' });

  const nameField = el('div', { className: 'field' });
  nameField.append(
    el('label', { text: 'Full name', attributes: { for: 'reg-name' } }),
    el('input', {
      attributes: { type: 'text', id: 'reg-name', name: 'fullName', autocomplete: 'name' },
    })
  );

  const emailField = el('div', { className: 'field' });
  emailField.append(
    el('label', { text: 'Email address', attributes: { for: 'reg-email' } }),
    el('input', {
      attributes: { type: 'email', id: 'reg-email', name: 'email', autocomplete: 'email' },
    })
  );

  row.append(nameField, emailField);

  const ticketField = el('div', { className: 'field' });
  ticketField.append(
    el('label', { text: 'Preferred ticket', attributes: { for: 'reg-ticket' } })
  );
  const ticketSelect = el('select', { attributes: { id: 'reg-ticket', name: 'ticketTypeId' } });
  (event.ticketTypes || []).forEach((ticket) => {
    ticketSelect.append(
      el('option', {
        text: `${ticket.ticketName} - ${ticket.price === 0 ? 'Free' : formatPrice(ticket.price)}`,
        attributes: { value: String(ticket.ticketTypeId) },
      })
    );
  });
  if ((event.ticketTypes || []).length === 0) {
    ticketSelect.append(
      el('option', { text: 'Ticket prices to be announced', attributes: { value: '' } })
    );
  }
  ticketField.append(ticketSelect);

  const quantityField = el('div', { className: 'field' });
  quantityField.append(
    el('label', { text: 'Number of tickets', attributes: { for: 'reg-quantity' } }),
    el('input', {
      attributes: { type: 'number', id: 'reg-quantity', name: 'quantity', min: '1', max: '10', value: '1' },
    })
  );

  const message = el('p', {
    className: 'field-message',
    attributes: { id: 'reg-message', role: 'status', 'aria-live': 'polite' },
  });

  const submit = el('button', {
    className: 'button button--secondary button--block',
    text: 'Submit registration',
    attributes: { type: 'submit' },
  });

  form.append(row, ticketField, quantityField, submit, message);

  // Client-side validation, then the same "under construction" dialog that the
  // Register button shows.
  form.addEventListener('submit', (domEvent) => {
    domEvent.preventDefault();

    const name = form.querySelector('#reg-name').value.trim();
    const email = form.querySelector('#reg-email').value.trim();
    const quantity = Number(form.querySelector('#reg-quantity').value);

    if (name.length < 2) {
      message.textContent = 'Please enter your full name.';
      message.className = 'field-message field-message--error';
      form.querySelector('#reg-name').focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      message.textContent = 'Please enter a valid email address, for example name@example.com.';
      message.className = 'field-message field-message--error';
      form.querySelector('#reg-email').focus();
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      message.textContent = 'Please choose between 1 and 10 tickets.';
      message.className = 'field-message field-message--error';
      form.querySelector('#reg-quantity').focus();
      return;
    }

    message.textContent = `Thank you ${name}. Your details were validated in the browser.`;
    message.className = 'field-message field-message--success';

    showUnderConstructionModal('Submitting a registration');
  });

  wrapper.append(form);
  return wrapper;
}

/** Contact panel for the organisation running the event. */
function buildOrganiserPanel(event) {
  const panel = el('div', { className: 'panel' });
  panel.append(el('h2', { text: 'Organised by' }));
  panel.append(el('h3', { text: event.organizationName }));
  panel.append(
    el('p', {
      text:
        'This event is hosted by one of our partner charities. Contact them directly ' +
        'for questions about the venue, accessibility or sponsorship.',
    })
  );
  const list = el('ul', { className: 'contact-list' });
  const city = el('li');
  city.append(el('span', { text: 'Based in' }), el('span', { text: event.city }));
  list.append(city);
  panel.append(list);
  panel.append(
    el('p', {
      html: `<a class="button button--small button--outline" href="search.html">Find more events</a>`,
    })
  );
  return panel;
}

/* ------------------------------------------------------------------ */
/* Fallbacks                                                           */
/* ------------------------------------------------------------------ */

/** Shown when no id is present in the URL or in localStorage. */
function renderMissingId() {
  const root = select('#event-root');
  showError(
    root,
    'No event was selected.',
    ['Open an event from the home page or the search page, and its details will appear here.']
  );
  appendBackLink(root);
}

/** A safe way back if something went wrong. */
function appendBackLink(root) {
  const container = root.querySelector('.container') || root;
  const paragraph = el('p');
  paragraph.style.textAlign = 'center';
  paragraph.innerHTML = `
    <a class="button button--outline" href="index.html">Back to the home page</a>
    <a class="button button--ghost" href="search.html">Search for an event</a>`;
  container.append(paragraph);
}
