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
    var addEventDiv = document.getElementById('add-event');

    if (authResult && !authResult.error) {
        authorizeDiv.style.display = 'none';
        addEventDiv.style.display = 'inline';
		// Load Google Calendar client library. List upcoming events once client library is loaded.
        gapi.client.load('calendar', 'v3', listUpcomingEvents);
    } else {
        // Show auth UI, allowing the user to initiate authorization by
        // clicking authorize button, hide other UI.
        authorizeDiv.addEventListener("click", handleAuthClick);
        authorizeDiv.style.display = 'inline';
        addEventDiv.style.display = 'none';
    }
}


/**
 * Print the summary and start datetime/date of the next ten events in
 * the authorized user's calendar. If no events are found an
 * appropriate message is printed.
 */
function listUpcomingEvents() {
    var request = gapi.client.calendar.events.list({
        'calendarId': 'primary',
        'timeMin': (new Date()).toISOString(),
        'showDeleted': false,
        'singleEvents': true,
        'maxResults': 10,
        'orderBy': 'startTime'
    });

    request.execute(function(resp) {
        var events = resp.items;
        appendPre('Upcoming events:');

        if (events.length > 0) {
            for (i = 0; i < events.length; i++) {
                var event = events[i];
                var when = event.start.dateTime;
                if (!when) {
                    when = event.start.date;
                }
                appendPre(event.summary + ' (' + when + ')')
            }
        } else {
            appendPre('No upcoming events found.');
        }

    });
}

/**
 * Append a pre element to the body containing the given message
 * as its text node.
 *
 * @param {string} message Text to be placed in pre element.
 */
function appendPre(message) {
    var pre = document.getElementById('output');
    var textContent = document.createTextNode(message + '\n');
    pre.appendChild(textContent);
}