/*
 * Copyright 2016, Lorenzo Mangani (lorenzo.mangani@gmail.com)
 * Copyright 2015, Rao Chenlin (rao.chenlin@gmail.com)
 *
 * This file is part of Sentinl (http://github.com/sirensolutions/sentinl)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import _ from 'lodash';
import moment from 'moment';
import chrome from 'ui/chrome';
import uiModules from 'ui/modules';
import uiRoutes from 'ui/routes';

/* import controllers */
import './controllers/reportController';

import $ from 'jquery';

/* Elasticsearch */
import elasticsearch from 'elasticsearch-browser';

/* Ace editor */
import ace from 'ace';

/* Timepicker */
import 'ui/timepicker';
import 'ui/courier';
import 'ui/filter_bar';

// import TableVisTypeProvider from 'ui/template_vis_type/TemplateVisType';
// import VisSchemasProvider from 'ui/vis/schemas';
// import tableVisTemplate from 'plugins/table_vis/table_vis.html';
// require('ui/registry/vis_types').register(TableVisTypeProvider);

import AggResponseTabifyTabifyProvider from 'ui/agg_response/tabify/tabify';
// import tableSpyModeTemplate from 'plugins/spy_modes/table_spy_mode.html';

import Notifier from 'ui/notify/notifier';
// import 'ui/autoload/styles';

/* Custom Template + CSS */
import './less/main.less';
import template from './templates/index.html';
import about from './templates/about.html';
import alarms from './templates/alarms.html';
import reports from './templates/reports.html';
import jsonHtml from './templates/json.html';
import watcherEditorForm from './templates/watcherEditorForm.html';

var impactLogo = require('plugins/sentinl/sentinl_logo.svg');
var smallLogo = require('plugins/sentinl/sentinl.svg');

chrome
  .setBrand({
    logo: 'url(' + impactLogo + ') left no-repeat',
    smallLogo: 'url(' + smallLogo + ') left no-repeat'
  })
  .setNavBackground('#222222')
  .setTabs([
    {
      id: '',
      title: 'Watchers',
      activeIndicatorColor: '#EFF0F2'
    },
    {
      id: 'alarms',
      title: 'Alarms',
      activeIndicatorColor: '#EFF0F2'
    },
    {
      id: 'reports',
      title: 'Reports',
      activeIndicatorColor: '#EFF0F2'
    },
    {
      id: 'about',
      title: 'About',
      activeIndicatorColor: '#EFF0F2'
    }
  ]);

uiRoutes.enable();

uiRoutes
.when('/', {
  template,
  resolve: {
    currentTime($http) {
      return $http.get('../api/sentinl/example')
      .then((resp) => resp.data.time);
    }
  }
});

uiRoutes
.when('/alarms', {
  template: alarms,
  resolve: {
    currentTime($http) {
      return $http.get('../api/sentinl/example').then(function (resp) {
        return resp.data.time;
      });
    }
  }
});

uiRoutes
.when('/reports', {
  template: reports,
  resolve: {
    currentTime($http) {
      return $http.get('../api/sentinl/example').then(function (resp) {
        return resp.data.time;
      });
    }
  }
});

uiRoutes
.when('/about', {
  template: about
});

uiModules
.get('api/sentinl', [])
.filter('moment', function () {
  return function (dateString) {
    return moment(dateString).format('YYYY-MM-DD HH:mm:ss.sss');
  };
})
.controller('sentinlHelloWorld', function ($rootScope, $scope, $route, $interval,
  $timeout, timefilter, Private, Notifier, $window, kbnUrl, $http) {
  $scope.title = 'Sentinl: Alarms';
  $scope.description = 'Kibana Alert App for Elasticsearch';

  $scope.notify = new Notifier();

  timefilter.enabled = true;

  /* Update Time Filter */
  var updateFilter = function () {
    return $http.get('../api/sentinl/set/interval/' + JSON.stringify($scope.timeInterval).replace(/\//g, '%2F'));
  };

  /* First Boot */

  $scope.elasticAlarms = [];
  $scope.timeInterval = timefilter.time;
  updateFilter();
  $http.get('../api/sentinl/list/alarms')
  .then(
    (resp) => $scope.elasticAlarms = resp.data.hits.hits,
    $scope.notify.error
  );

  /* Listen for refreshInterval changes */

  $rootScope.$watchCollection('timefilter.time', function (newvar, oldvar) {
    if (newvar === oldvar) { return; }
    let timeInterval = _.get($rootScope, 'timefilter.time');
    if (timeInterval) {
      $scope.timeInterval = timeInterval;
      updateFilter();
      $route.reload();
    }
  });

  $rootScope.$watchCollection('timefilter.refreshInterval', function () {
    let refreshValue = _.get($rootScope, 'timefilter.refreshInterval.value');
    let refreshPause = _.get($rootScope, 'timefilter.refreshInterval.pause');

    // Kill any existing timer immediately
    if ($scope.refreshalarms) {
      $timeout.cancel($scope.refreshalarms);
      $scope.refreshalarms = undefined;
    }

    // Check if Paused
    if (refreshPause) {
      if ($scope.refreshalarms) $timeout.cancel($scope.refreshalarms);
      return;
    }

    // Process New Filter
    if (refreshValue !== $scope.currentRefresh && refreshValue !== 0) {
      // new refresh value
      if (_.isNumber(refreshValue) && !refreshPause) {
        $scope.newRefresh = refreshValue;
        // Reset Interval & Schedule Next
        $scope.refreshalarms = $timeout(function () {
          $route.reload();
        }, refreshValue);
        $scope.$watch('$destroy', $scope.refreshalarms);
      } else {
        $scope.currentRefresh = 0;
        $timeout.cancel($scope.refreshalarms);
      }
    } else {
      $timeout.cancel($scope.refreshalarms);
    }
  });

  $scope.deleteAlarm = function (index, rmindex, rmtype, rmid) {
    if (confirm('Delete is Forever!\n Are you sure?')) {
      return $http.delete('../api/sentinl/alarm/' + rmindex + '/' + rmtype + '/' + rmid)
      .then(() => {
        $timeout(() => {
          $scope.elasticAlarms.splice(index - 1, 1);
          $scope.notify.warning('SENTINL Alarm log successfully deleted!');
          $route.reload();
        }, 1000);
      })
      .catch($scope.notify.error);
    }
  };

  $scope.deleteAlarmLocal = function (index) {
    $scope.notify.warning('SENTINL function not yet implemented!');
  };

  var currentTime = moment($route.current.locals.currentTime);
  $scope.currentTime = currentTime.format('HH:mm:ss');
  var utcTime = moment.utc($route.current.locals.currentTime);
  $scope.utcTime = utcTime.format('HH:mm:ss');
  var unsubscribe = $interval(function () {
    $scope.currentTime = currentTime.add(1, 'second').format('HH:mm:ss');
    $scope.utcTime = utcTime.add(1, 'second').format('HH:mm:ss');
  }, 1000);
  $scope.$watch('$destroy', unsubscribe);

});

// WATCHER EDITOR FORM CONTROLLER
uiModules
.get('api/sentinl', [])
.controller('WatcherEditorInstanceCtrl', function ($scope, $modalInstance, watcher) {

  $scope.watcher = watcher;

  $scope.form = {
    status: !$scope.watcher._source.disable ? 'Enabled' : 'Disable',
    time: { // TO-DO timepicker and datepicker
      now: new Date(),
      hstep: 1,
      mstep: 1,
      ismeridian: true,
      seconds: true
    },
    actions: {
      editor: {},
      toEdit: {},
      webhook: {
        viaProxy: false
      },
      email: {}
    }
  };

  $scope.toggleWatcher = function () {
    if (!$scope.watcher._source.disable) {
      $scope.form.status = 'Enabled';
      $scope.watcher._source.disable = false;
    } else {
      $scope.form.status = 'Disabled';
      $scope.watcher._source.disable = true;
    }
  };

  $scope.aceOptions = {
    mode: ['json', 'Javascript'],
    advanced: {
      highlightActiveLine: true
    }
  };

  $scope.getInput = function () {
    $scope.editorInputEdit = ace.edit('inputEdit');
    $scope.editorInputEdit.getSession().setMode('ace/mode/json');
  }

  $scope.getTransform = function () {
    $scope.editorTransformEdit = ace.edit('transformEdit');
    $scope.editorTransformEdit.getSession().setMode('ace/mode/javascript');
  }

  $scope.getCondition = function () {
    $scope.editorConditionEdit = ace.edit('conditionEdit');
    $scope.editorConditionEdit.getSession().setMode('ace/mode/javascript');
  }

  $scope.enableAdvancedFields = function (actionType, actionName, enable) {
    if (actionType === 'webhook') {
      if (enable) {
        $scope.watcher._source.actions[actionName][actionType].path = ':/{{payload.watcher_id}';
        $scope.watcher._source.actions[actionName][actionType].headers = JSON.stringify({
          'Content-Type': 'application/x-www-form-urlencoded' });
      } else {
        delete $scope.watcher._source.actions[actionName][actionType].path;
        delete $scope.watcher._source.actions[actionName][actionType].headers;
      }
    }
  };

  $scope.editAction = function (name, properties) {
    if (!$scope.form.actions.toEdit[name]) {
      $scope.form.actions.toEdit[name] = true;
    } else {
      $scope.form.actions.toEdit[name] = false;
    }

    if (_.has(properties, 'webhook')) {
      if (!_.has($scope.form.actions.editor, name)) {
        $scope.form.actions.editor[name] = {};
      }
      $scope.form.actions.editor[name].editorWebhookHeaders = ace.edit('webhookHeaders');
      $scope.form.actions.editor[name].editorWebhookHeaders.getSession().setMode('ace/mode/json');
      $scope.form.actions.editor[name].editorWebhookBody = ace.edit('webhookBody');
      $scope.form.actions.editor[name].editorWebhookBody.getSession().setMode('ace/mode/json');
    }

    $scope.watcher._source.actions[name].$title = name;
  };

  const renameActions = function (actions) {
    const newActions = {};
    _.forOwn(actions, (settings, name) => {
      newActions[settings.$title] = settings;
      delete newActions[settings.$title].$title;
    });
    return newActions;
  };

  $scope.save = function () {
    $scope.watcher._source.input = JSON.parse($scope.editorInputEdit.getValue());
    $scope.watcher._source.transform.script.script = JSON.parse($scope.editorTransformEdit.getValue());
    $scope.watcher._source.condition.script.script = JSON.parse($scope.editorConditionEdit.getValue());

    //_.forOwn($scope.form.action.editor, (value, key) => {
    //
    //});

    $scope.watcher._source.actions = renameActions($scope.watcher._source.actions);

    $modalInstance.close($scope.watcher);
  };

  $scope.cancel = function () {
    $modalInstance.dismiss('cancel');
  };
});

// WATCHERS CONTROLLER
uiModules
.get('api/sentinl', [])
.controller('sentinlWatchers', function ($rootScope, $scope, $route, $interval,
  $timeout, timefilter, Private, Notifier, $window, kbnUrl, $http, $modal, $log) {
  const tabifyAggResponse = Private(AggResponseTabifyTabifyProvider);

  $scope.title = 'Sentinl: Watchers';
  $scope.description = 'Kibana Alert App for Elasticsearch';

  $scope.notify = new Notifier();

  $scope.topNavMenu = [
    {
      key: 'watchers',
      description: 'WATCH',
      run: function () { kbnUrl.change('/'); }
    },
    {
      key: 'about',
      description: 'ABOUT',
      run: function () { kbnUrl.change('/about'); }
    }
  ];

  timefilter.enabled = false;

  $scope.watchers = [];

  function importWatcherFromLocalStorage() {
    /* New Entry from Saved Kibana Query */
    if ($window.localStorage.getItem('sentinl_saved_query')) {
      $scope.watcherNew(JSON.parse($window.localStorage.getItem('sentinl_saved_query')));
      $window.localStorage.removeItem('sentinl_saved_query');
    }
  };

  $scope.openWatcherEditorForm = function ($index) {

    const modalInstance = $modal.open({
      template: watcherEditorForm,
      controller: 'WatcherEditorInstanceCtrl',
      size: 'lg',
      resolve: {
        watcher: function () {
          return $scope.watchers[$index];
        },
      }
    });

    modalInstance.result.then((watcher) => {
      $scope.watchers[$index] = watcher;
      $scope.watcherSave($index, true);
    }).catch((error) => {
      if (!_.contains(['cancel', 'backdrop click'], error)) {
        $log.error(error);
      }
    });
  };

  $http.get('../api/sentinl/list')
  .then((response) => {
    $scope.watchers = response.data.hits.hits;
    importWatcherFromLocalStorage();
  })
  .catch((error) => {
    $scope.notify.error(error);
    importWatcherFromLocalStorage();
  });

  /* ACE Editor */
  $scope.editor;
  $scope.editor_status = { readonly: false, undo: false, new: false };
  $scope.setAce = function ($index, edit) {
    $scope.editor = ace.edit('editor-' + $index);
    var _session = $scope.editor.getSession();
    $scope.editor.setReadOnly(edit);
    $scope.editor_status.readonly = edit;
    _session.setUndoManager(new ace.UndoManager());

    $scope.editor_status.undo = $scope.editor.session.getUndoManager().isClean();

    if (!edit) { $scope.editor.getSession().setMode('ace/mode/json'); }
    else { $scope.editor.getSession().setMode('ace/mode/text'); }
  };

  $scope.watcherDelete = function ($index) {
    if (confirm('Are you sure?')) {
      return $http.delete('../api/sentinl/watcher/' + $scope.watchers[$index]._id)
      .then(
        (resp) => {
          $timeout(function () {
            $route.reload();
            $scope.notify.warning('SENTINL Watcher successfully deleted!');
          }, 1000);
        },
        $scope.notify.error
      );
    }
  };

  $scope.watcherSave = function ($index, callFromWatcherEditorForm = false) {
    let watcher;
    if ($scope.editor && !callFromWatcherEditorForm) {
      watcher = JSON.parse($scope.editor.getValue());
    } else {
      watcher = $scope.watchers[$index];
    }

    console.log('saving object:', watcher);
    return $http.post(`../api/sentinl/watcher/${watcher._id}`, watcher)
    .then(
      () => {
        $timeout(() => {
          $route.reload();
          $scope.notify.warning('SENTINL Watcher successfully saved!');
        }, 1000);
      },
      $scope.notify.error
    );
  };

  $scope.getWatchers = function () {
    return $scope.watchers;
  };

  /* New Entry */
  $scope.watcherNew = function (newwatcher) {
    if (!newwatcher) {
      var wid = 'new_watcher_' + Math.random().toString(36).substr(2, 9);
      newwatcher = {
        _index: 'watcher',
        _type: 'watch',
        _id: wid,
        _new: 'true',
        _source: {
          title: 'watcher_title',
          disable: false,
          uuid: wid,
          trigger: {
            schedule: {
              later: 'every 5 minutes'
            }
          },
          input: {
            search: {
              request: {
                index: [],
                body: {},
              }
            }
          },
          condition: {
            script: {
              script: 'payload.hits.total > 100'
            }
          },
          transform: {},
          actions: {
            email_admin: {
              throttle_period: '15m',
              email: {
                to: 'alarm@localhost',
                from: 'sentinl@localhost',
                subject: 'Sentinl Alarm',
                priority: 'high',
                body: 'Found {{payload.hits.total}} Events'
              }
            }
          }
        }
      };
    }
    $scope.watchers.unshift(newwatcher);
  };
  $scope.reporterNew = function (newwatcher) {
    if (!newwatcher) {
      var wid = 'reporter_' + Math.random().toString(36).substr(2, 9);
      newwatcher = {
        _index: 'watcher',
        _type: 'watch',
        _id: wid,
        _new: 'true',
        _source: {
          title: 'reporter_title',
          disable: false,
          uuid: wid,
          trigger: {
            schedule: {
              later: 'every 1 hour'
            }
          },
          report : true,
          transform: {},
          actions: {
            report_admin: {
              throttle_period: '15m',
              report: {
                to: 'report@localhost',
                from: 'sentinl@localhost',
                subject: 'Sentinl Report',
                priority: 'high',
                body: 'Sample Sentinl Screenshot Report',
                save: true,
                snapshot : {
                  res : '1280x900',
                  url : 'http://127.0.0.1/app/kibana#/dashboard/Alerts',
                  path : '/tmp/',
                  params : {
                    username : 'username',
                    password : 'password',
                    delay : 5000,
                    crop : false
                  }
                }
              }
            }
          }
        }
      };
    }
    $scope.watchers.unshift(newwatcher);
  };

  var currentTime = moment($route.current.locals.currentTime);
  $scope.currentTime = currentTime.format('HH:mm:ss');
  var utcTime = moment.utc($route.current.locals.currentTime);
  $scope.utcTime = utcTime.format('HH:mm:ss');
  var unsubscribe = $interval(function () {
    $scope.currentTime = currentTime.add(1, 'second').format('HH:mm:ss');
    $scope.utcTime = utcTime.add(1, 'second').format('HH:mm:ss');
  }, 1000);
  $scope.$watch('$destroy', unsubscribe);

});

// NEW END

uiModules
.get('api/sentinl', [])
.controller('sentinlAbout', function ($scope, $route, $interval, timefilter, Notifier) {
  $scope.title = 'Sentinl';
  $scope.description = 'Kibana Alert App for Elasticsearch';
  timefilter.enabled = false;
  $scope.notify = new Notifier();

  if (!$scope.notified) {
    $scope.notify.warning('SENTINL is a work in progress! Use at your own risk!');
    $scope.notified = true;
  }

  var currentTime = moment($route.current.locals.currentTime);
  $scope.currentTime = currentTime.format('HH:mm:ss');
  var utcTime = moment.utc($route.current.locals.currentTime);
  $scope.utcTime = utcTime.format('HH:mm:ss');
  var unsubscribe = $interval(function () {
    $scope.currentTime = currentTime.add(1, 'second').format('HH:mm:ss');
    $scope.utcTime = utcTime.add(1, 'second').format('HH:mm:ss');
  }, 1000);
  $scope.$watch('$destroy', unsubscribe);
});
