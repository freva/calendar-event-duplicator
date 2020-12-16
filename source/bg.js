const defaults = {};
let flatpickrCalendar;
let accessToken;

/* Initialize extension: set localization string, call check authorization. */
window.onload = function() {
    checkAuth();

	document.onreadystatechange = function () {
		if (document.readyState == 'complete') {
			localizeAttribute('placeholder');
			localizeAttribute('innerhtml');
		}
	}
}

function checkAuth() {
    chrome.identity.getAuthToken({'interactive': false}, handleAuthResult);
}

function revokeAccess() {
    console.log('Removing access token', accessToken);
    chrome.identity.removeCachedAuthToken({token: accessToken}, checkAuth);
}


function localizeAttribute(attribute) {
	const objects = document.querySelectorAll('[data-' + attribute + ']');
	for (let i = 0; i < objects.length; i++) {
		objects[i][attribute] = chrome.i18n.getMessage(objects[i].getAttribute('data-' + attribute));
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

		for (let i = 0; i < events.length; i++) {
			const opt = document.createElement('option');
			opt.value = events[i].id;
			opt.innerHTML = events[i].summary;
			selectCalendar.appendChild(opt);
		}
		
		chrome.storage.sync.get('defaults', function(result) {
			if (!('defaults' in result)) return; 
			
			for (let i = 0; i < events.length; i++) { // Only keep the defaults of currently existing calendars
				if (events[i].id in result.defaults) {
					defaults[events[i].id] = result.defaults[events[i].id];
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
	for (let i = 0; i < startTimes.length; i++) {
		const start = moment(startTimes[i]);
		const end = start.clone().add(duration);
		
		const shouldOverrideReminders = values['event-notification'].length !== 0;
		const eventResource = {
			summary: values['event-title'],
			start: {
				dateTime: moment(startDate).format()
			},
			end: {
				dateTime: moment(endDate).format()
			},
			reminders: {
				useDefault: !shouldOverrideReminders
			}
		};
		
		if (shouldOverrideReminders) {
			eventResource.reminders.overrides = [{method: 'popup', 'minutes': values['event-notification']}];

		const request = gapi.client.calendar.events.insert({
			'calendarId': values['event-calendar-list'],
			'resource': eventResource
		});

		request.execute(function(response) {
            if (response?.code === 401) return revokeAccess();
			if ('error' in response) return toastr.error(response['message']);
		});
	}
	
	form.reset();
	calendar.clear();
	document.getElementById('add-event-calendar-list').onchange();
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
