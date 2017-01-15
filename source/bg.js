function getParams(immediate) {
    var manifest = chrome.runtime.getManifest();
    var clientId = encodeURIComponent(manifest.oauth2.client_id);
    var scopes = manifest.oauth2.scopes.join(' ');

    return {'client_id': clientId, 'scope': scopes, 'immediate': immediate};
}

/**
 * Initiate auth flow in response to user clicking authorize button.
 * @param {Event} event Button click event.
 */
function handleAuthClick(event) {
    gapi.auth.authorize(getParams(false), handleAuthResult);
    return false;
}

function checkAuth() {
    gapi.auth.authorize(getParams(true), handleAuthResult);
}

/**
 * Handle response from authorization server.
 * @param {Object} authResult Authorization result.
 */
function handleAuthResult(authResult) {
    var authorizeDiv = document.getElementById('authorize-div');
    var addEventDiv = document.getElementById('add-event-form');

    if (authResult && !authResult.error) {
        authorizeDiv.style.display = 'none';
        addEventDiv.style.display = 'inline';
		addEventDiv.addEventListener('submit', submitAddEventForm);
        gapi.client.load('calendar', 'v3', initializeAddEventForm);
    } else {
        // Show auth UI, allowing the user to initiate authorization by
        // clicking authorize button, hide other UI.
        authorizeDiv.addEventListener("click", handleAuthClick);
        authorizeDiv.style.display = 'inline';
        addEventDiv.style.display = 'none';
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
	
	Flatpickr.l10ns.default.firstDayOfWeek = 1;
	flatpickr("#add-event-start-dates", {
		"enableTime": true,
		"mode": "multiple",
		"altInput": true,
		"altFormat": "M d, Y H:i",
		"altInputClass": "start-date-element",
		"time_24hr": true,
		"minuteIncrement": 15,
		"onOpen": function(selectedDates, dateStr, instance) {
			document.getElementById('content').style.marginTop = "70px";
		},
		"onClose": function(selectedDates, dateStr, instance){
			document.getElementById('content').style.marginTop = "0px";
		}
	});
	
	flatpickr("#add-event-duration", {
		"enableTime": true,
		"noCalendar": true,
		"time_24hr": true
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
		return setMessage("error", "Select event duration");
	}
	
	if (values["event-start-dates"].length == 0) {
		return setMessage("error", "Select at least one start date");
	}
	
	var duration = moment.duration(values["event-duration"], "HH:mm").asMilliseconds();
	var startDates = values["event-start-dates"].split("; ");
	for (var i = 0; i < startDates.length; i++) {
		var startDate = new Date(Date.parse(startDates[i]));
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
	setMessage("success", "Successfully added %number% events".replace("%number%", startDates.length));
}


function setMessage(type, message) {
	var messageField = document.getElementById('add-event-message');
	messageField.style.display = 'block';
	messageField.className = type;
	messageField.innerText = message;
}
