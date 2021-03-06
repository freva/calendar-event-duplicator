const defaults = {};
let lastUpdatedCalendarId;
let flatpickrCalendar;
let accessToken;

/* Initialize extension: set localization string, call check authorization. */
window.onload = function() {
    localizeAttribute('placeholder');
    localizeAttribute('innerHTML');
    checkAuth();
}

function checkAuth() {
    chrome.identity.getAuthToken({'interactive': false}, handleAuthResult);
}

function revokeAccess() {
    console.log('Removing access token', accessToken);
    chrome.identity.removeCachedAuthToken({token: accessToken}, checkAuth);
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
        gapi.client.setToken({access_token: authResult});
        authorizeDiv.style.display = 'none';
        addEventDiv.style.display = 'inline';
		addEventDiv.addEventListener('submit', submitAddEventForm);
        gapi.client.load('calendar', 'v3', initializeAddEventForm);
    } else {
        // Show auth UI, allowing the user to initiate authorization by
        // clicking authorize button, hide other UI.
        addEventDiv.style.display = 'none';
        authorizeDiv.style.display = 'inline';
        authorizeDiv.addEventListener('click', function (event) {
			event.preventDefault();
			chrome.identity.getAuthToken({'interactive': true}, handleAuthResult);
		});
    }
}

/**
 * Initializes the add event form with user's calendars and Flatpickr for duration/start times
 */
function initializeAddEventForm() {
    const request = gapi.client.calendar.calendarList.list({
        'minAccessRole': 'writer',
        'showDeleted': false
	});
	
    request.execute(function(response) {
        if (response?.code === 401) return revokeAccess();
		if ('error' in response) return toastr.error(response['message']);

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
				if (id in result.defaults) {
					defaults[id] = result.defaults[id];
				}
            }

            selectCalendar.onchange();
		});
    });
	
	setFlatpickerLocale();
	flatpickrCalendar = flatpickr('#add-event-start-times', {
		mode: 'multiple',
		altFormat: 'M d, Y H:i',
		altInputClass: 'start-times-visible',
		enableTime: true,
		weekNumbers: true,
		altInput: true,
		time_24hr: true,
		minuteIncrement: 15
	});
	
	flatpickr('#add-event-duration', {
		enableTime: true,
		noCalendar: true,
		time_24hr: true
	});
	
	toastr.options = {
		positionClass: 'toast-position',
		preventDuplicates: true,
		timeOut: 5000,
		hideEasing: 'linear',
		showMethod: 'fadeIn',
		hideMethod: 'fadeOut'
	}
	
	const bns = document.getElementsByClassName('save');
	for (let i = 0; i < bns.length; i++) {
		bns[i].addEventListener('click', saveDefaultValue);
	}
}

function submitAddEventForm(event) {
	event.preventDefault();
	
	const form = document.getElementById('add-event-form');
	const values = {};
	for (const element of form.elements)
	   values[element.name] = element.value;
	
	if (values['event-duration'].length === 0)
		return toastr.warning(chrome.i18n.getMessage('message_error_no_duration'));
	
	if (values['event-start-times'].length === 0)
		return toastr.warning(chrome.i18n.getMessage('message_error_no_start_times'));
	
	const duration = moment.duration(values['event-duration'], 'HH:mm');
	const startTimes = values['event-start-times'].split('; ');
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

		eventResource['start'] = isAllDay ?  { date: start.format('YYYY-MM-DD') } : { dateTime: start.format() };
        eventResource['end'] = isAllDay ? { date: start.format('YYYY-MM-DD') } : { dateTime: end.format() };

		if (shouldOverrideReminders)
			eventResource.reminders.overrides = [{method: 'popup', 'minutes': values['event-notification']}];

		const request = gapi.client.calendar.events.insert({
			'calendarId': values['event-calendar-list'],
			'resource': eventResource
		});

		request.execute(function(response) {
            if (response?.code === 401) return revokeAccess();
			if ('error' in response) return toastr.error(response['message']);
		});

        chrome.storage.sync.set({lastUpdatedCalendarId: values['event-calendar-list']}, () => { });
	}

	const selectCalendar = document.getElementById('add-event-calendar-list');
	const selectedIndex = selectCalendar.selectedIndex;
	form.reset();
	flatpickrCalendar.clear();
	selectCalendar.selectedIndex = selectedIndex;
	selectCalendar.onchange();
	toastr.success(chrome.i18n.getMessage('message_success_event_created', [startTimes.length]));
}


function saveDefaultValue(event) {
	const updateInput = document.getElementById(event.srcElement.dataset.field);
	const selectCalendar = document.getElementById('add-event-calendar-list');
	const selectedCalendarId = selectCalendar.options[selectCalendar.selectedIndex].value;
	
	if (!(selectedCalendarId in defaults)) {
		defaults[selectedCalendarId] = {};
	}
	defaults[selectedCalendarId][updateInput.name] = updateInput.value.trim();

	chrome.storage.sync.set({defaults}, function() {
		toastr.success(chrome.i18n.getMessage('message_success_saved_default'));
	});
}

function setFlatpickerLocale() {
	function getLocaleJson(msgId) {
		const jsonString = chrome.i18n.getMessage(msgId).replaceAll('\'' , '"');
		return JSON.parse(jsonString);
	}
	
	Flatpickr.l10ns.default.weekdays.shorthand = getLocaleJson('flatpickr_weekdays_shorthand');
	Flatpickr.l10ns.default.weekdays.longhand = getLocaleJson('flatpickr_weekdays_longhand');
	Flatpickr.l10ns.default.months.shorthand = getLocaleJson('flatpickr_months_shorthand');
	Flatpickr.l10ns.default.months.longhand = getLocaleJson('flatpickr_months_longhand');
	Flatpickr.l10ns.default.scrollTitle = chrome.i18n.getMessage('flatpickr_scrollTitle');
	Flatpickr.l10ns.default.toggleTitle = chrome.i18n.getMessage('flatpickr_toggleTitle');
	Flatpickr.l10ns.default.firstDayOfWeek = parseInt(chrome.i18n.getMessage('flatpickr_firstDayOfWeek'));
}
