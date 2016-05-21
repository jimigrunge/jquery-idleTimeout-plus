/**
 * This work is licensed under the Creative Commons Attribution-Share Alike 3.0
 * United States License. To view a copy of this license,
 * visit http://creativecommons.org/licenses/by-sa/3.0/us/ or send a letter
 * to Creative Commons, 171 Second Street, Suite 300, San Francisco, California, 94105, USA.
 *
 * Modified by: Jason Abraham (CrashSensei)
 * Email: jason@linearsoft.com
 *
 * Configurable idle (no activity) timer and logout redirect for jQuery.
 * Supports both jQueryUI dialogs or Bootstrap modals
 * Works across multiple windows, tabs from the same domain.

 *
 * Initially forked from Jill Elaine's jquery-idleTimeout
 * Bootstrap code and other code influenced by bootstrap-session-timeout by orangehill
 *
 * Dependencies: JQuery v1.7+,
 *      Multi-window support requires JQuery Storage API
 *      Dialogs require either jQueryUI or Bootstrap
 *
 * version 0.5.0
 **/
;(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery'], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(require('jquery'));
    } else {
        root.IdleTimeoutPlus = factory(root.jQuery);
    }

}(this, function (jquery) {


    //#########################################################################
    // ###  Config & Vars
    //#########################################################################
    var config = {
        //Idle settings
        idleTimeLimit:      1200,                               //'No activity' time limit in seconds. 1200 = 20 Minutes
        idleCallback:       false,                              // Called when the idleTimer is started (you can use this to close your custom warn/lock screens if needed)
        idleCheckHeartbeat: 2,                                  // Frequency to check for idle timeouts in seconds
        activityEvents:     'click keypress scroll wheel ' +    // configure which activity events to detect separate each event with a space, set to false for none
        'mousewheel mousemove touchmove',
        bootstrap:          false,                              // Use bootstrap framework instead of jQuery

        //Warning settings
        warnEnabled:            true,                               // set to false to skip warning period
        warnTimeLimit:          180,                                // 3 Minutes
        warnCallback:           false,                              // Called when warning timer starts (wait dialog will only be shown if this returns true)
        warnContentCallback:    false,                              // Called for content of warning dialog box (SEE DOCUMENTATION!)
        warnTitle:              'Session Timeout',
        warnMessage:            'Your session is about to expire!',
        warnStayAliveButton:    'Stay Connected',
        warnLogoutButton:       'Logout',
        warnCountdownMessage:   'Time remaining: {timer}',          //Set to false to disable see doc on how to set
        warnCountdownBar:       false,

        //Lock Screen settings
        lockEnabled:                false,                      // Set to true to enable lock screen before redirecting
        lockTimeLimit:              7200,                       // 2 hrs
        lockHaltKeepAlive:          true,                       // Stop the keepAlive functionality durring the lock screen timeout
        lockCallback:               false,                      // Called when lock screen timer starts (lock screen will only be shown if this returns true)
        lockContentCallback:        false,                      // Called for content of lock screen (SEE DOCUMENTATION!)
        lockPassCallback:           false,                      // Required if using any of the internal lock screen functions (this function returns true if the correct password is entered)
        lockTitle:                  null,                       // Lock title null=no title
        lockUsername:               'System User',              // Set to current user name (otherwise the internal lock screen will look crappy)
        lockMessage:                'Enter your password to unlock the screen',
        lockUnlockButton:           'UnLock',
        lockLogoutButton:           'Not {username} ?',         // This is actually an href link
        lockCountdownMessage:       'Auto-logout in: {timer}',
        lockBlockUiConfig:          {},                         // Customize the blockUI options

        //Auto-Url settings                     (NOTE: if a callback is defined auto url redirection will only occur if the callback returns true)
        redirectUrl:        '/timed-out',       //URL if no action is taken after the warning/lock screen timeout
        redirectCallback:   false,
        logoutUrl:          '/logout',          //URL if the user clicks "Logout" on the warning/lock screen
        logoutCallback:     false,
        logoutAutoUrl:      '/logout-notice',   //URL for secondary tabs that received an automatic logout trigger (to help avoid race conditions)
        logoutAutoCallback: false,

        //Session keep alive settings
        keepAliveInterval:  600,                    //ping the server at this interval in seconds. 600 = 10 Minutes. Set to false to disable pings
        keepAliveUrl:       window.location.href,   // set URL to ping - does not apply if keepAliveInterval: false
        keepAliveAjaxType:  'GET',
        keepAliveAjaxData:  '',

        //Extensions

        multiWindowSupport: true    //Requires jquery-storage-api
    };



    var bodyElm     = $('body'); //Store for jQuery optimization
    var dataStore   = null;

    //#########################################################################
    // ###  Public API Functions
    //#########################################################################
    var api = {}; //Create return object

    /**
     * Starts the timers and initializes the config
     *
     * @param userConfig object array
     * @returns {boolean}
     */
    api.start = function (userConfig) {

        //--Merge default and user configs
        config = $.extend(config, userConfig);


        //--Convert secs to millisecs
        config.idleTimeLimit        *= 1000;
        config.idleCheckHeartbeat   *= 1000;
        config.warnTimeLimit        *= 1000;
        config.lockTimeLimit        *= 1000;
        config.keepAliveInterval    *= 1000;

        //--Validate config options
        if(config.multiWindowSupport) {
            if(!$.localStorage) {
                console.error('jitp: Multi-Window support requested but JQuery Storage API is unavailable');
                return false;
            }
        }
        if( (config.warnEnabled && config.warnCallback === false) ||
            (config.lockEnabled && config.lockCallback === false) ) {
            if(config.bootstrap) {
                if (typeof($.fn.modal) === 'undefined') {
                    console.error('jitp: Bootstrap library is unavailable');
                    return false;
                }
            } else {
                if (typeof(jQuery.ui) === 'undefined') {
                    console.error('jitp: jQueryUI library is unavailable');
                    return false;
                }
            }
        }
        if(config.lockEnabled && config.lockCallback === false) {
            if(typeof($.blockUI) === 'undefined') {
                console.error('jitp: Lock screen requested but blockUI library is unavailable');
                return false;
            }
            if(config.lockPassCallback === false) {
                console.error('jitp: Lock screen requested but lockPassCallback function is not set');
                return false;
            }
        }


        if(config.multiWindowSupport) dataStore = ($.initNamespaceStorage('jqueryIdleTimeoutPlus')).localStorage;
        else dataStore = {};

        //--Start base processes
        if (config.keepAliveInterval) {
            startKeepSessionAlive();
        }

        activityDetector();


        //--Check if we are already in lockdown
        if(config.lockEnabled && loadData('lockStartTime',-1) != -1) {
            initSubLock();
        } else {
            //--Initialize and start idle timer
            storeData('logoutTriggered',false);
            storeData('warningStartTime',-1);
            storeData('lockStartTime',-1);
            storeData('lastActivity',$.now());
            startIdleTimer();
        }
        return true;
    };

    /**
     * Call this to cause a logout of all windows
     */
    api.logout = function () {

        handleLogout();
    };

    /**
     * Displays the warning dialog (meant to be used by your warnCallback function)
     */
    api.displayWarning = function () {

        openWarningDialog();
    };

    /**
     * Displays the lock screen (meant to be used by your lockCallback function)
     */
    api.displayLockScreen = function () {

        openLockScreen();
    };

    /**
     * Clears warning/lock timers and reverts back to idleTimeout
     */
    api.rollback = function () {

        rollbackLock();
        rollbackWarning();
    };


    //#########################################################################
    //## Private Functions
    //#########################################################################

    function storeData(key,value) {
        if(config.multiWindowSupport) {
            dataStore.set(key,value);
        } else {
            dataStore[key] = value;
        }
    }

    function loadData(key,defaultValue) {
        defaultValue = typeof defaultValue !== 'undefined' ? defaultValue : null;
        if(config.multiWindowSupport) {
            if(dataStore.isSet(key)) return dataStore.get(key);
        } else {
            if(key in dataStore) return dataStore[key];
        }
        return defaultValue;
    }

    // -------------------------- Idle Monitoring --------------------------//
    var idleTimer;
    var mousePosition = [-1, -1];

    function initIdle() {
        storeData('warningStartTime',-1);
        storeData('lockStartTime',-1);
        startIdleTimer();
        if(config.idleCallback !== false) config.idleCallback(config);
    }

    function startIdleTimer() {

        stopIdleTimer();
        storeData('lastActivity',$.now());
        idleTimer = setInterval(checkIdleTimeout,config.idleCheckHeartbeat);
    }

    function stopIdleTimer() {

        clearInterval(idleTimer);
    }

    function checkIdleTimeout() {
        // Note: lastActivity stops being updated once the warning/lock period starts
        var idleTimeoutTime = (loadData('lastActivity', $.now()) + config.idleTimeLimit);

        //Check to see if other windows/tabs have had a critical event
        if (loadData('logoutTriggered') === true) {

            return handleLogoutTrigger();
        }
        if($.now() >= idleTimeoutTime) {

            stopIdleTimer();
            if (!config.warnEnabled) { // warning dialog is disabled

                if (config.lockEnabled) return initLock();
                return handleRedirect(); // immediately redirect user when user is idle for idleTimeLimit
            }
            return initWarning();
        }
    }

    function activityDetector() {
        $(document).on(config.activityEvents, function (e) {
            if (e.type === 'mousemove') {
                // Solves mousemove even when mouse not moving issue on Chrome:
                // https://code.google.com/p/chromium/issues/detail?id=241476
                if (e.clientX === mousePosition[0] && e.clientY === mousePosition[1]) {
                    return;
                }
                mousePosition[0] = e.clientX;
                mousePosition[1] = e.clientY;
            }
            if(loadData('warningStartTime',-1) == -1 && loadData('lockStartTime',-1) == -1 ) {

                startIdleTimer();
            }

        });
    }

    // -------------------------- Session Keep Alive --------------------------//
    var keepAliveInterval;

    function startKeepSessionAlive() {

        stopKeepSessionAlive();
        keepAliveInterval = setInterval(function() {

            $.ajax({
                type:   config.keepAliveAjaxType,
                url:    config.keepAliveUrl,
                data:   config.keepAliveAjaxData
            });
        }, config.keepAliveInterval);
    }

    function stopKeepSessionAlive() {

        clearInterval(keepAliveInterval);
    }

    // -------------------------- Warning Functions --------------------------//

    var warningTimer;
    var warningDialogEnabled = true;
    var warningDialogActive = false;
    var warningDialogElm = null;
    var warningCountdownElm = null;
    var warningCountdownBarElm = null;

    function initWarning() {

        startWarningTimer();
        if(config.warnCallback !== false) warningDialogEnabled = config.warnCallback(config);
        openWarningDialog();
    }

    function rollbackWarning() {

        stopWarningTimer();
        closeWarningDialog();
        storeData('warningStartTime',-1);
        initIdle();
    }

    function startWarningTimer() {

        storeData('warningStartTime',$.now());
        warningTimer = setInterval(checkWarningTimeout, 500);
    }

    function stopWarningTimer() {

        clearInterval(warningTimer);
    }

    function checkWarningTimeout() {
        //Check to see if other windows/tabs have had a critical event
        if (loadData('logoutTriggered') === true) {

            stopWarningTimer();
            return handleLogoutTrigger();
        }
        //Has the warning been cleared (possibly by another tab/window)
        if(loadData('warningStartTime',-1) == -1) {

            return rollbackWarning();
        }
        //Check if timeout exceeded
        var warningTimeout = (loadData('warningStartTime') + config.warnTimeLimit)-1;
        if ($.now() >= warningTimeout) {
            stopWarningTimer();
            if(config.lockEnabled) {
                //warningStart is not set to -1 to avoid having other tabs/windows do a rollback
                closeWarningDialog();
                return initLock();
            }
            return handleRedirect();
        }
        //Update dialog
        updateWarningDialog();
    }

    function openWarningDialog() {

        if(!warningDialogEnabled) return;
        initializeWarningDialog();
        updateWarningDialog();
        if(config.bootstrap) {
            warningDialogElm.modal('show');
        } else {
            warningDialogElm.dialog('open');
        }
        warningDialogActive = true;
    }

    function closeWarningDialog() {

        warningDialogActive = false;
        if(warningDialogElm === null) return;
        if(config.bootstrap) {
            warningDialogElm.modal('hide'); //Despite modal being self-closing this is used if warning is cleared on another window
            // http://stackoverflow.com/questions/11519660/twitter-bootstrap-modal-backdrop-doesnt-disappear
            bodyElm.removeClass('modal-open');
            $('div.modal-backdrop').remove();
        } else {
            warningDialogElm.dialog('close');
        }
    }

    function updateWarningDialog() {
        if(warningDialogElm === null) return;
        if(warningCountdownElm === null && warningCountdownBarElm === null) return;
        var currTime = $.now();
        var totalSecsLeft = Math.floor(((loadData('warningStartTime',currTime) + config.warnTimeLimit) - currTime)/1000);
        if(warningCountdownElm !== null) {
            warningCountdownElm.html(time2txt(totalSecsLeft));
        }
        if(warningCountdownBarElm != null) {
            var percentLeft = Math.floor(totalSecsLeft/(config.warnTimeLimit/1000) * 100);
            if(config.bootstrap) {
                warningCountdownBarElm.css('width', percentLeft + '%');
            } else {
                warningCountdownBarElm.progressbar('value',percentLeft);
            }
        }
    }

    function initializeWarningDialog() {

        if(warningDialogElm !== null) return;
        var content = '';
        if(config.warnContentCallback !== false) {
            content = config.warnContentCallback(config);
        } else {
            if (config.bootstrap)content = getWarningContentBootstrap();
            else content = getWarningContentJquery();
        }
        if(config.bootstrap) createWarningBootstrap(content);
        else createWarningJquery(content);
    }

    function createWarningBootstrap(content) {

        bodyElm.append(content);
        $('#jitp-warn-logout').on('click', function() {
            onWarningLogoutButton();
        });
        $('#jitp-warn-alive').on('click', function() {
            onStayAliveButton();
        });

        warningDialogElm = $('#jitp-warn-display');
        if(config.warnCountdownMessage != false || config.warnCountdownBar ) {
            warningCountdownElm = warningDialogElm.find('.jitp-countdown-holder');
        }

        if(config.warnCountdownBar) {
            warningCountdownBarElm = $('#jitp-warn-bar');
        }

    }

    function createWarningJquery(content) {

        $(content).dialog({
            buttons: [
                {
                    text: config.warnLogoutButton,
                    click: function () {
                        onWarningLogoutButton();
                    }
                },
                {
                    text: config.warnStayAliveButton,
                    click: function () {
                        onStayAliveButton();
                    }
                }
            ],
            closeOnEscape: false,
            modal: true,
            title: config.warnTitle,
            minWidth: 320,
            autoOpen: false,
            open: function () {
                //hide the dialog's upper right corner "x" close button
                $(this).closest('.ui-dialog').find('.ui-dialog-titlebar-close').hide();
                $(this).parent().find('button:nth-child(2)').focus(); //Focus StayAlive button
            }
        });

        warningDialogElm = $('#jitp-warn-display');
        if(config.warnCountdownMessage != false) {
            warningCountdownElm = warningDialogElm.find('.jitp-countdown-holder');
        }

        if(config.warnCountdownBar) {
            warningCountdownBarElm = $('#jitp-warn-bar');
            warningCountdownBarElm.progressbar({
                value: 0,
                max: 100
            });
        }
    }

    function getWarningContentBootstrap() {

        var countdownMsg = config.warnCountdownMessage ?
        '<p>' + config.warnCountdownMessage.replace(/{timer}/g, '<span class="jitp-countdown-holder"></span>') + '</p>'
            : '';
        var countdownBar = config.warnCountdownBar ?
            '<div class="progress"> \
              <div id="jitp-warn-bar" class="progress-bar progress-bar-striped active" role="progressbar" style="min-width: 15px; width: 100%;"> \
                <span class="jitp-countdown-holder"></span> \
              </div> \
            </div>'
            : '';
        return (
            '<div class="modal fade" id="jitp-warn-display" data-backdrop="static" data-keyboard="false"> \
                <div class="modal-dialog"> \
                    <div class="modal-content"> \
                        <div class="modal-header"> \
                            <h4 class="modal-title">' + config.warnTitle + '</h4> \
                        </div> \
                        <div class="modal-body"> \
                            <p>' + config.warnMessage + '</p> \
                            ' + countdownMsg + ' \
                            ' + countdownBar + ' \
                        </div> \
                        <div class="modal-footer"> \
                            <button id="jitp-warn-logout" type="button" class="btn btn-default">' + config.warnLogoutButton + '</button> \
                            <button id="jitp-warn-alive" type="button" class="btn btn-primary">' + config.warnStayAliveButton + '</button> \
                        </div> \
                    </div> \
                </div> \
            </div>'
        );
    }

    function getWarningContentJquery() {

        var countdownMsg = config.warnCountdownMessage ?
        '<p>' + config.warnCountdownMessage.replace(/{timer}/g, '<span class="jitp-countdown-holder"></span>') + '</p>'
            : '';
        var countdownBar = config.warnCountdownBar ?
            '<div id="jitp-warn-bar"></div>'
            : '';
        return (
            '<div id="jitp-warn-display">' +
            '<p>' + config.warnMessage + '</p>' +
            countdownMsg +
            countdownBar +
            '</div>'
        );
    }

    function onWarningLogoutButton() {

        stopWarningTimer();
        handleLogout();
    }

    function onStayAliveButton() {

        rollbackWarning();
    }


    // -------------------------- LockScreen Functions --------------------------//

    var lockTimer;
    var lockScreenEnabled = true;
    var lockScreenActive = false;
    var lockScreenElm = null;
    var lockScreenCountdownElm = null;

    function initLock() {

        if(config.lockHaltKeepAlive) stopKeepSessionAlive();
        startLockTimer();
        if(config.lockCallback !== false) lockScreenEnabled = config.lockCallback(config);
        openLockScreen();
    }

    function initSubLock() {

        if(config.lockHaltKeepAlive) stopKeepSessionAlive();
        lockTimer = setInterval(checkLockTimeout, 500);
        openLockScreen();
    }

    function rollbackLock() {

        stopLockTimer();
        closeLockScreen();
        if(config.keepAliveInterval) startKeepSessionAlive();
        storeData('lockStartTime',-1);
        initIdle();
    }

    function startLockTimer() {

        storeData('lockStartTime',$.now());
        lockTimer = setInterval(checkLockTimeout, 500);
    }

    function stopLockTimer() {

        clearInterval(lockTimer);
    }

    function checkLockTimeout() {
        //Check to see if other windows/tabs have had a critical event
        if (loadData('logoutTriggered') === true) {

            stopLockTimer();
            return handleLogoutTrigger();
        }
        //Has the lock been cleared (possibly by another tab/window)
        if(loadData('lockStartTime',-1) == -1) {

            return rollbackLock();
        }
        //Check if timeout exceeded
        var lockTimeout = (loadData('lockStartTime') + config.lockTimeLimit)-1;
        if ($.now() >= lockTimeout) {
            stopLockTimer();
            return handleRedirect();
        }
        //Update dialog if open
        updateLockScreen();
    }

    function openLockScreen() {

        if(!lockScreenEnabled) return;
        initializeLockScreen();
        updateLockScreen();
        var blockConfig = {
            message: $('#jitp-lock-display')
        };
        blockConfig = $.extend(blockConfig, config.lockBlockUiConfig);
        $.blockUI(blockConfig);

        lockScreenActive = true;
    }

    function closeLockScreen() {

        $.unblockUI();
        lockScreenActive = false;
    }

    function updateLockScreen() {
        if(lockScreenCountdownElm !== null) {
            var currTime = $.now();
            var totalSecsLeft = Math.floor(((loadData('lockStartTime',currTime) + config.lockTimeLimit) - currTime)/1000);
            lockScreenCountdownElm.html(time2txt(totalSecsLeft));
        }
    }

    function initializeLockScreen() {
        if(lockScreenElm !== null) return;
        var content = '';
        if(config.lockContentCallback !== false) {
            content = config.lockContentCallback(config);
        } else {
            if (config.bootstrap)content = getLockContentBootstrap();
            else content = getLockContentJquery();
        }
        bodyElm.append(content);
        lockScreenElm = $('#jitp-lock-display');

        if(config.lockCountdownMessage != false ) {
            lockScreenCountdownElm = lockScreenElm.find('.jitp-countdown-holder');
        }

        $('#jitp-lock-logout').on('click', function() {
            onLockLogoutButton();
        });
        $('#jitp-lock-unlock').on('click', function() {
            onUnlockButton();
        });

        updateLockScreen();
    }

    function getLockContentBootstrap() {

        var title = config.lockTitle !== null ?
        '<div class="panel-heading"><h2 class="panel-title">' + config.lockTitle + '</h2></div>'
            : '';
        var logoutMsg = config.lockLogoutButton.replace(/{username}/g,config.lockUsername);
        var countdownMsg = config.lockCountdownMessage ?
        '<div class="panel-footer">' + config.lockCountdownMessage.replace(/{timer}/g, '<span class="jitp-countdown-holder">BUBBA</span>') + '</div>'
            : '';

        return (
            '<div id="jitp-lock-display" class="jitp-lock-back" style="display: none;"> \
            <div class="panel panel-default jitp-lock-panel"> \
                ' + title + ' \
                <div class="panel-body"> \
                    <h4>' + config.lockUsername + '</h4> \
                    <p>' + config.lockMessage + '</p> \
                    <div class="input-group"> \
                        <input id="jitp-lock-pass" type="text" class="form-control" placeholder="Password..."/> \
                        <span class="input-group-btn"> \
                            <button id="jitp-lock-unlock" class="btn btn-primary" type="button">' + config.lockUnlockButton + '</button> \
                        </span> \
                    </div> \
                    <a id="jitp-lock-logout" href="javascript:;">' + logoutMsg + '</a> \
                </div> \
                ' + countdownMsg + '\
            </div>\
            </div>'
        );
    }

    function getLockContentJquery() {
        //TODO: Make this less ugly of a form with only jQuery/jQueryUI and no external dependencies (any volunteers?)
        var title = config.lockTitle !== null ?
        '<header>' + config.lockTitle + '</header>'
            : '';
        var logoutMsg = config.lockLogoutButton.replace(/{username}/g,config.lockUsername);
        var countdownMsg = config.lockCountdownMessage ?
        '<footer>' + config.lockCountdownMessage.replace(/{timer}/g, '<span class="jitp-countdown-holder"></span>') + '</footer>'
            : '';

        return (
            '<div id="jitp-lock-display" class="jitp-lock-back" style="display: none;"> \
            <div class="jitp-lock-panel jitp-lock-jqpanel"> \
                ' + title + ' \
                <div class="jitp-lock-jqpanel-body"> \
                    <h2>' + config.lockUsername + '</h2> \
                    <p>' + config.lockMessage + '</p> \
                    <div> \
                        <input id="jitp-lock-pass" type="text" class="form-control" placeholder="Password..."/> \
                    </div> \
                    <button id="jitp-lock-unlock" type="button">' + config.lockUnlockButton + '</button> \
                    <a id="jitp-lock-logout" href="javascript:;">' + logoutMsg + '</a> \
                </div> \
                ' + countdownMsg + '\
            </div>\
            </div>'
        );
    }

    function onLockLogoutButton() {
        stopLockTimer();
        handleLogout();
    }

    function onUnlockButton() {

        if(!config.lockPassCallback($('#jitp-lock-pass').val())) {

            return;
        }
        rollbackLock();
    }

    // -------------------------- Logout & Redirect --------------------------//

    function handleLogout() {
        storeData('logoutTriggered',true);
        if(typeof config.logoutCallback == 'function') {
            if(!config.logoutCallback(config)) return; //Redirect only done on true return
        }
        window.location = config.logoutUrl;
    }

    function handleLogoutTrigger() {
        if(typeof config.logoutAutoCallback == 'function') {
            if(!config.logoutAutoCallback(config)) return;
        }
        window.location = config.logoutAutoUrl;
    }

    function handleRedirect() {
        if(typeof config.redirectCallback == 'function') {
            if(!config.redirectCallback(config)) return;
        }
        window.location.href = config.redirectUrl;
    }



    // -------------------------- Utility Functions --------------------------//

    function time2txt(secs) {
        var minLeft =  Math.floor(secs/60);
        if(minLeft <= 15) {
            var secsLeft = secs % 60;
            var timeTxt = minLeft > 0 ? minLeft + 'm ' : '';
            timeTxt += secsLeft + 's';
            return timeTxt;
        }
        if(minLeft <= 75) {
            if(minLeft <= 22) return 'about 15 mins';
            if(minLeft <= 37) return 'about 30 mins';
            if(minLeft <= 52) return 'about 25 mins';
            return 'about 1 hour'
        }
        var hoursLeft = Math.floor(minLeft/60);
        minLeft %= 60;
        if(minLeft <= 15 || minLeft >52) return 'about '+hoursLeft+' hours';
        return 'about '+hoursLeft+'&frac12; hours';
    }

    return api;

}));
