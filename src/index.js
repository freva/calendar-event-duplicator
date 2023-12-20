import flatpickr from 'flatpickr';
import moment from 'moment';
import toastr from 'toastr';
import 'flatpickr/dist/themes/material_green.css';
import 'toastr/build/toastr.css';

const addEventStartTimesDiv = document.getElementById('add-event-start-times');
const defaults = {};
let lastUpdatedCalendarId;
let flatpickrCalendar;
let calendar;

/* Initialize extension: set localization string, call check authorization. */
window.onload = function() {
    localizeAttribute('placeholder');
    localizeAttribute('innerHTML');
    checkAuth();
}

function checkAuth() {
    chrome.identity.getAuthToken({interactive: false}, handleAuthResult);
}

function localizeAttribute(attribute) {
	const objects = document.querySelectorAll('[data-' + attribute.toLowerCase() + ']');
	for (const obj of objects) {
		obj[attribute] = chrome.i18n.getMessage(obj.getAttribute('data-' + attribute.toLowerCase()));
	}
}

/**
 * Handle response from authorization server.
 * @param {Object} authResult Authorization result.
 */
function handleAuthResult(authResult) {
    const authorizeDiv = document.getElementById('authorize-div');
    const addEventDiv = document.getElementById('add-event-form');

    if (authResult && !authResult.error) {
        authorizeDiv.style.display = 'none';
        addEventDiv.style.display = 'inline';
		addEventDiv.addEventListener('submit', submitAddEventForm);
		calendar = new Calendar(authResult);
        initializeAddEventForm();
    } else {
        // Show auth UI, allowing the user to initiate authorization by
        // clicking authorize button, hide other UI.
        addEventDiv.style.display = 'none';
        authorizeDiv.style.display = 'inline';
        authorizeDiv.addEventListener('click', function (event) {
			event.preventDefault();
			chrome.identity.getAuthToken({interactive: true}, handleAuthResult);
		});
    }
}

/** Initializes the add event form with user's calendars and Flatpickr for duration/start times */
function initializeAddEventForm() {
    calendar.list({
        minAccessRole: 'writer',
        showDeleted: false
	}).then(response => {
        const calendars = response.items;

        const selectCalendar = document.getElementById('add-event-calendar-list');
		selectCalendar.onchange = function () {
			const selectedCalendarId = selectCalendar.options[selectCalendar.selectedIndex].value;
			if (!(selectedCalendarId in defaults)) {
				defaults[selectedCalendarId] = {};
			}

			var inputs = document.getElementById('add-event-settings').getElementsByTagName('input');
			for (const input of inputs) {
				if (input.name in defaults[selectedCalendarId]) {
					input.value = defaults[selectedCalendarId][input.name];
				} else {
					input.value = '';
				}
			}
		}

        chrome.storage.sync.get(['defaults', 'lastUpdatedCalendarId'], function(result) {
            lastUpdatedCalendarId = result.lastUpdatedCalendarId;

            for (const { id, summary } of calendars) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.innerHTML = summary;
                opt.selected = id === lastUpdatedCalendarId;
                selectCalendar.appendChild(opt);

                 // Only keep the defaults of currently existing calendars
				if (result.defaults && id in result.defaults) {
					defaults[id] = result.defaults[id];
				}
            }

            selectCalendar.onchange();
		});
    }).catch(({ message }) => toastr.error(message));
	
	setFlatpickerLocale();
	flatpickrCalendar = flatpickr(addEventStartTimesDiv, {
		mode: 'multiple',
		altFormat: 'M d, Y H:i',
		enableTime: true,
		weekNumbers: true,
		altInput: true,
		time_24hr: true,
		minuteIncrement: 15,
		onChange: (dates, datesStr, instance) => addEventStartTimesDiv.innerText = datesStr,
	});
	addEventStartTimesDiv.onclick = flatpickrCalendar.open;
	
	flatpickr('#add-event-duration', {
		enableTime: true,
		noCalendar: true,
		time_24hr: true,
		defaultHour: 8,
	});
	
	toastr.options = {
		positionClass: 'toast-position',
		preventDuplicates: true,
		timeOut: 5000,
		hideEasing: 'linear',
		showMethod: 'fadeIn',
		hideMethod: 'fadeOut',
	}
	
	const bns = document.getElementsByClassName('save');
	for (let i = 0; i < bns.length; i++) {
		bns[i].addEventListener('click', saveDefaultValue);
	}
}

async function submitAddEventForm(event) {
	event.preventDefault();
	
	const form = document.getElementById('add-event-form');
	const values = {};
	for (const element of form.elements)
		values[element.name] = element.value;

	if (values['event-duration'].length === 0)
		return toastr.warning(chrome.i18n.getMessage('message_error_no_duration'));

	const startTimes = addEventStartTimesDiv.innerText.split(', ').filter(s => s.length > 0);
	if (startTimes.length === 0)
		return toastr.warning(chrome.i18n.getMessage('message_error_no_start_times'));

	const duration = moment.duration(values['event-duration'], 'HH:mm');
	const isAllDay = duration.asMilliseconds() === 0;
	for (let i = 0; i < startTimes.length; i++) {
		const start = moment(startTimes[i]);
		const end = start.clone().add(duration);
		
		const shouldOverrideReminders = values['event-notification'].length !== 0;
		const eventResource = {
			summary: values['event-title'],
			reminders: {
				useDefault: !shouldOverrideReminders
			}
		};

		eventResource.start = isAllDay ?  { date: start.format('YYYY-MM-DD') } : { dateTime: start.format() };
        eventResource.end = isAllDay ? { date: start.format('YYYY-MM-DD') } : { dateTime: end.format() };

		if (shouldOverrideReminders)
			eventResource.reminders.overrides = [{method: 'popup', 'minutes': values['event-notification']}];

		try {
			await calendar.insertEvent(values['event-calendar-list'], eventResource);
		} catch (error) {
			return toastr.error(error.message);
		}

	}

	const selectCalendar = document.getElementById('add-event-calendar-list');
	const selectedIndex = selectCalendar.selectedIndex;
	form.reset();
	flatpickrCalendar.clear();
	selectCalendar.selectedIndex = selectedIndex;
	selectCalendar.onchange();
	chrome.storage.sync.set({lastUpdatedCalendarId: values['event-calendar-list']}, () => { });
	toastr.success(chrome.i18n.getMessage('message_success_event_created', [startTimes.length]));
}

function saveDefaultValue(event) {
	const updateInput = document.getElementById(event.target.dataset.field);
	const selectCalendar = document.getElementById('add-event-calendar-list');
	const selectedCalendarId = selectCalendar.options[selectCalendar.selectedIndex].value;
	
	if (!(selectedCalendarId in defaults)) {
		defaults[selectedCalendarId] = {};
	}
	defaults[selectedCalendarId][updateInput.name] = updateInput.value.trim();

	chrome.storage.sync.set({ defaults },
		() => toastr.success(chrome.i18n.getMessage('message_success_saved_default')));
}

function setFlatpickerLocale() {
	function getLocaleJson(msgId) {
		const jsonString = chrome.i18n.getMessage(msgId).replaceAll('\'' , '"');
		return JSON.parse(jsonString);
	}
	
	flatpickr.l10ns.default.weekdays.shorthand = getLocaleJson('flatpickr_weekdays_shorthand');
	flatpickr.l10ns.default.weekdays.longhand = getLocaleJson('flatpickr_weekdays_longhand');
	flatpickr.l10ns.default.months.shorthand = getLocaleJson('flatpickr_months_shorthand');
	flatpickr.l10ns.default.months.longhand = getLocaleJson('flatpickr_months_longhand');
	flatpickr.l10ns.default.scrollTitle = chrome.i18n.getMessage('flatpickr_scrollTitle');
	flatpickr.l10ns.default.toggleTitle = chrome.i18n.getMessage('flatpickr_toggleTitle');
	flatpickr.l10ns.default.firstDayOfWeek = parseInt(chrome.i18n.getMessage('flatpickr_firstDayOfWeek'));
}

class Calendar {
	constructor(accessToken) {
		this.accessToken = accessToken;
	}

	list(options) {
		const query = options ? '?' + new URLSearchParams(options).toString() : '';
		return this.#request('GET', `/users/me/calendarList${query}`);
	}

	insertEvent(calendarId, event) {
		return this.#request('POST', `/calendars/${calendarId}/events`, JSON.stringify(event));
	}

	#request(method, path, body) {
		const options = {
			method,
			body,
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
			}
		};
		return fetch(`https://www.googleapis.com/calendar/v3${path}`, options)
			.then(response => {
				if (response.ok) return response.json();
				if (response.status === 401)
					chrome.identity.removeCachedAuthToken({token: this.accessToken}, checkAuth);
				return response.text().then((text) => {
					let message = text;
					try {
						const json = JSON.parse(text);
						if ('message' in json) message = json.message;
					} catch (e) {
						// not JSON
					}
					return Promise.reject({message, code: response.status});
				});
			});
	}
}
