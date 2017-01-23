var calendar;

/*
 * Initialize extension: set localization string, call check authorization.
 */
function init() {
	localizeAttribute("placeholder");
	localizeAttribute("innerHTML");

	checkAuth();
}

function localizeAttribute(attribute) {
	var objects = document.querySelectorAll('[data-' + attribute + ']');
	for(i = 0; i < objects.length; i++) {
		objects[i][attribute] = chrome.i18n.getMessage(objects[i].getAttribute("data-" + attribute));
	}
}

/**
 * Attempt to get access token from authorization server.
 */
function checkAuth() {
    var manifest = chrome.runtime.getManifest();
    var clientId = encodeURIComponent(manifest.oauth2.client_id);
    var scopes = manifest.oauth2.scopes.join(' ');

    gapi.auth.authorize({'client_id': clientId, 'scope': scopes, 'immediate': true}, handleAuthResult);
}

/**
 * Handle response from authorization server.
 * @param {Object} authResult Authorization result.
 */
function handleAuthResult(authResult) {
    var authorizeDiv = document.getElementById('authorize-div');
    var addEventDiv = document.getElementById('add-event-form');
	
    if (authResult.access_token) {
        authorizeDiv.style.display = 'none';
        addEventDiv.style.display = 'inline';
		addEventDiv.addEventListener('submit', submitAddEventForm);
        gapi.client.load('calendar', 'v3', initializeAddEventForm);
    } else if (authResult.error) {
        // Show auth UI, allowing the user to initiate authorization by
        // clicking authorize button, hide other UI.
        addEventDiv.style.display = 'none';
        authorizeDiv.style.display = 'inline';
        authorizeDiv.addEventListener("click", function (event) {
			event.preventDefault();
			chrome.identity.getAuthToken({'interactive': true}, handleAuthResult);
		});
    } else { // The token has expired, remove it and request new
		chrome.identity.removeCachedAuthToken({'token': authResult}, checkAuth);
	}
}

/**
 * Initializes the add event form with user's calendars and Flatpickr for duration/start times
 */
function initializeAddEventForm() {
    var request = gapi.client.calendar.calendarList.list({
        'minAccessRole': 'writer',
        'showDeleted': false
	});
	
    request.execute(function(resp) {
        var events = resp.items;
        var selectCalendar = document.getElementById('add-event-calendar-list');
		selectCalendar.onchange = function () {
			var selectedElement = selectCalendar.options[selectCalendar.selectedIndex];
			var notification = selectedElement.dataset.notification;
			document.getElementById('add-event-notification').value = notification;
		};

		for (i = 0; i < events.length; i++) {
			var opt = document.createElement('option');
			opt.value = events[i].id;
			opt.innerHTML = events[i].summary;
			if (events[i].defaultReminders.length > 0) {
				opt.dataset.notification = events[i].defaultReminders[0].minutes;
			} else {
				opt.dataset.notification = "";
			}
			selectCalendar.appendChild(opt);
		}
		selectCalendar.onchange();
    });
	
	setFlatpickerLocale();
	calendar = flatpickr("#add-event-start-times", {
		enableTime: true,
		mode: "multiple",
		altInput: true,
		altFormat: "M d, Y H:i",
		altInputClass: "start-times-visible",
		time_24hr: true,
		minuteIncrement: 15
	});
	
	flatpickr("#add-event-duration", {
		enableTime: true,
		noCalendar: true,
		time_24hr: true
	});
}

function submitAddEventForm(event) {
	event.preventDefault();
	
	var form = document.getElementById('add-event-form');
	var values = {};
	for (var i = 0; i < form.elements.length; i++) {
	   var e = form.elements[i];
	   values[e.name] = e.value;
	}
	
	if (values["event-duration"].length == 0) {
		return setMessage("error", chrome.i18n.getMessage("message_error_no_duration"));
	}
	
	if (values["event-start-times"].length == 0) {
		return setMessage("error", chrome.i18n.getMessage("message_error_no_start_times"));
	}
	
	var duration = moment.duration(values["event-duration"], "HH:mm").asMilliseconds();
	var startTimes = values["event-start-times"].split("; ");
	for (var i = 0; i < startTimes.length; i++) {
		var startDate = new Date(Date.parse(startTimes[i]));
		var endDate = new Date(startDate.getTime() + duration );
		
		var eventResource = {
			'summary': values["event-title"],
			'start': {
				'dateTime': moment(startDate).format()
			},
			'end': {
				'dateTime': moment(endDate).format()
			},
			'reminders': {
				'useDefault': false,
				'overrides': [
					{'method': 'popup', 'minutes': values["event-notification"]}
				]
			}
		};

		var request = gapi.client.calendar.events.insert({
			'calendarId': values["event-calendar-list"],
			'resource': eventResource
		});

		request.execute(function(response) {
			if ("error" in response) {
				return setMessage("error", response["message"]);
			}
		});
	}
	
	form.reset();
	calendar.clear();
	setMessage("success", chrome.i18n.getMessage("message_success_event_created", [startTimes.length]));
}


function setMessage(type, message) {
	var messageField = document.getElementById('add-event-message');
	messageField.style.display = 'block';
	messageField.className = type;
	messageField.innerText = message;
}

function setFlatpickerLocale() {
	function getLocaleJson(msgId) {
		var jsonString = chrome.i18n.getMessage(msgId).replace(/'/g , "\"");
		return JSON.parse(jsonString);
	}
	
	Flatpickr.l10ns.default.weekdays.shorthand = getLocaleJson("flatpickr_weekdays_shorthand");
	Flatpickr.l10ns.default.weekdays.longhand = getLocaleJson("flatpickr_weekdays_longhand");
	Flatpickr.l10ns.default.months.shorthand = getLocaleJson("flatpickr_months_shorthand");
	Flatpickr.l10ns.default.months.longhand = getLocaleJson("flatpickr_months_longhand");
	Flatpickr.l10ns.default.scrollTitle = chrome.i18n.getMessage("flatpickr_scrollTitle");
	Flatpickr.l10ns.default.toggleTitle = chrome.i18n.getMessage("flatpickr_toggleTitle");
	Flatpickr.l10ns.default.firstDayOfWeek = parseInt(chrome.i18n.getMessage("flatpickr_firstDayOfWeek"));
}
