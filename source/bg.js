var defaults = {};
var calendar;
var access_token;

/*
 * Initialize extension: set localization string, call check authorization.
 */
window.onload = function() {
    checkAuth();
	
	document.onreadystatechange = function () {
		if (document.readyState == 'complete') {
			localizeAttribute("placeholder");
			localizeAttribute("innerhtml");
		}
	}
}

function checkAuth() {
    chrome.identity.getAuthToken({'interactive': false}, handleAuthResult);
}

function revokeAccess() {
    console.log("Removing access token", access_token);
    chrome.identity.removeCachedAuthToken({'token': access_token}, checkAuth);
}


function localizeAttribute(attribute) {
	var objects = document.querySelectorAll('[data-' + attribute + ']');
	for(i = 0; i < objects.length; i++) {
		objects[i][attribute] = chrome.i18n.getMessage(objects[i].getAttribute("data-" + attribute));
	}
}

/**
 * Handle response from authorization server.
 * @param {Object} authResult Authorization result.
 */
function handleAuthResult(authResult) {
    var authorizeDiv = document.getElementById('authorize-div');
    var addEventDiv = document.getElementById('add-event-form');
	
    if (authResult && !authResult.error) {
        access_token = authResult;
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
        authorizeDiv.addEventListener("click", function (event) {
			event.preventDefault();
			chrome.identity.getAuthToken({'interactive': true}, handleAuthResult);
		});
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
        if ("code" in resp && resp.code == 401) return revokeAccess();
		if ("error" in resp) return toastr.error(response["message"]);

        var events = resp.items;
        var selectCalendar = document.getElementById('add-event-calendar-list');
		selectCalendar.onchange = function () {
			var selectedCalendarId = selectCalendar.options[selectCalendar.selectedIndex].value;
			if (!(selectedCalendarId in defaults)) {
				defaults[selectedCalendarId] = {};
			}
			
			var inputs = document.getElementById('add-event-settings').getElementsByTagName('input');
			for (i = 0; i < inputs.length; i++) {
				if (inputs[i].name in defaults[selectedCalendarId]) {
					inputs[i].value = defaults[selectedCalendarId][inputs[i].name];
				} else {
					inputs[i].value = "";
				}
			}
		}

		for (i = 0; i < events.length; i++) {
			var opt = document.createElement('option');
			opt.value = events[i].id;
			opt.innerHTML = events[i].summary;
			selectCalendar.appendChild(opt);
		}
		
		chrome.storage.sync.get('defaults', function(result) {
			if (!('defaults' in result)) return; 
			
			for (i = 0; i < events.length; i++) { // Only keep the defaults of currently existing calendars
				if (events[i].id in result.defaults) {
					defaults[events[i].id] = result.defaults[events[i].id];
				}
			}
			selectCalendar.onchange();
		});
    });
	
	setFlatpickerLocale();
	calendar = flatpickr("#add-event-start-times", {
		mode: "multiple",
		altFormat: "M d, Y H:i",
		altInputClass: "start-times-visible",
		enableTime: true,
		weekNumbers: true,
		altInput: true,
		time_24hr: true,
		minuteIncrement: 15
	});
	
	flatpickr("#add-event-duration", {
		enableTime: true,
		noCalendar: true,
		time_24hr: true
	});
	
	toastr.options = {
		positionClass: "toast-position",
		preventDuplicates: true,
		timeOut: 5000,
		hideEasing: "linear",
		showMethod: "fadeIn",
		hideMethod: "fadeOut"
	}
	
	var bns = document.getElementsByClassName("save");
	for (i = 0; i < bns.length; i++) {
		bns[i].addEventListener("click", saveDefaultValue);
	}
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
		return toastr.warning(chrome.i18n.getMessage("message_error_no_duration"));
	}
	
	if (values["event-start-times"].length == 0) {
		return toastr.warning(chrome.i18n.getMessage("message_error_no_start_times"));
	}
	
	var duration = moment.duration(values["event-duration"], "HH:mm").asMilliseconds();
	var startTimes = values["event-start-times"].split("; ");
	for (var i = 0; i < startTimes.length; i++) {
		var startDate = new Date(Date.parse(startTimes[i]));
		var endDate = new Date(startDate.getTime() + duration );
		
		var shouldOverrideReminders = values["event-notification"].length != 0;
		var eventResource = {
			summary: values["event-title"],
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
			eventResource.reminders.overrides = [{method: 'popup', 'minutes': values["event-notification"]}];
		}

		var request = gapi.client.calendar.events.insert({
			'calendarId': values["event-calendar-list"],
			'resource': eventResource
		});

		request.execute(function(response) {
            if ("code" in resp && resp.code == 401) return revokeAccess();
			if ("error" in response) return toastr.error(response["message"]);
		});
	}
	
	form.reset();
	calendar.clear();
	document.getElementById('add-event-calendar-list').onchange();
	toastr.success(chrome.i18n.getMessage("message_success_event_created", [startTimes.length]));
}


function saveDefaultValue(event) {
	var updateInput = document.getElementById(event.srcElement.dataset.field);
	var selectCalendar = document.getElementById('add-event-calendar-list');
	var selectedCalendarId = selectCalendar.options[selectCalendar.selectedIndex].value;
	
	if (!(selectedCalendarId in defaults)) {
		defaults[selectedCalendarId] = {};
	}
	defaults[selectedCalendarId][updateInput.name] = updateInput.value.trim();

	chrome.storage.sync.set({'defaults': defaults}, function() {
		toastr.success(chrome.i18n.getMessage("message_success_saved_default"));
	});
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
