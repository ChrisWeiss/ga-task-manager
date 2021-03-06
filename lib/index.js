import provide from './provide';

/**
 * Class for the `ga-task-manager` analytics.js plugin.
 * @implements {GaTaskManagerPublicInterface}
 */
class GaTaskManager {
  /**
   * Registers declarative event tracking.
   * @param {!Tracker} tracker Passed internally by analytics.js
   */
  constructor(tracker) {
    this.tracker = tracker;
    this.registry = {};
    // @see https://developers.google.com/analytics/devguides/collection/analyticsjs/tasks
    this.gaTaskNames = [
      'customTask',
      'previewTask',
      'checkProtocolTask',
      'validationTask',
      'checkStorageTask',
      'historyImportTask',
      'samplerTask',
      'buildHitTask',
      'sendHitTask',
      'timingTask',
      'displayFeaturesTask'
    ];

    // Bind methods.
    this.addFunctionToTask = this.addFunctionToTask.bind(this);
    this.removeFunctionFromTask = this.removeFunctionFromTask.bind(this);
    this.setCustomDimension = this.setCustomDimension.bind(this);
    this.unsetCustomDimension = this.unsetCustomDimension.bind(this);

    this.gaTaskNames.forEach((gaTaskName) => {
      this.registry[gaTaskName] = {};
      // Grab a reference to the default function for this task and register it as the first task.
      this.addFunctionToTask(gaTaskName, 'original', tracker.get(gaTaskName));

      // Override the GA Tracker's task with our task manager executor which calls all user tasks added to the registry.
      this.tracker.set(gaTaskName, (model) => {
        for (var userTask in this.registry[gaTaskName]) {
          if (this.registry[gaTaskName].hasOwnProperty(userTask)) {
            this.registry[gaTaskName][userTask](model);
          }
        }
      });
    });
  }

  /**
   * Adds a function to be executed at the specified GA Task.
   * @param {string} gaTaskName The name of the GA Task to add the taskFunction to.
   * @param {string} userTaskName An arbitrary name for the task performed by the taskFunction.
   * @param {function(!Model)} taskFunction The function to be added to the execution stack of the GA Task specified in gaTaskName.
   * The GA Model Object (https://developers.google.com/analytics/devguides/collection/analyticsjs/model-object-reference) will be passed to it at time of execution.
   */
  addFunctionToTask(gaTaskName, userTaskName, taskFunction) {
    if (this.registry[gaTaskName]) {
      this.registry[gaTaskName][userTaskName] = taskFunction;
    }
  }

  /**
   * Removes a function from the specified GA Task by the name given by the user.
   * @param {string} gaTaskName The name of the GA Task to remove the task from.
   * @param {string} userTaskName The arbitrary name for the task given to addFunctionToTask.
   */
  removeFunctionFromTask(gaTaskName, userTaskName) {
    if (this.registry[gaTaskName] && this.registry[gaTaskName][userTaskName]) {
      delete this.registry[gaTaskName][userTaskName];
    }
  }

  /**
   * Adds a function which sets a GA Custom Dimension at the specified GA Task execution time. Defaults to execution on the customTask Task.
   * @param {string} index The index of your dimension as defined in your Google Analytics property settings.
   * @param {string|number|function(): string|number} value Arbitrary string, number or function to set value for the dimension.
   * If a function is given, it will be executed every time at the moment of task execution.
   * If a number is given, it will be cast automatically to a string by calling Number.toString() method.
   * Observe size limit for the string value https://developers.google.com/analytics/devguides/collection/analyticsjs/field-reference#customs
   * @param {string} gaTaskName The name of the GA Task on which to set the Custom Dimension. Defaults to 'customTask'.
   */
  setCustomDimension(index, value, gaTaskName = 'customTask') {
    const userTaskName = 'customDimension' + index;
    this.addFunctionToTask(gaTaskName, userTaskName, function(model){
        let auxValue = value;
        // If user provided a function to set value at execution time, then type check itsreturn value.
        if (typeof value == 'function') {
          auxValue = value();
          const auxType = typeof auxValue;
          if (auxType != 'string' && auxType != 'number') {
            throw new Error('Function ' + value.name + ' must return a string or number. Got ' + auxType + 'instead.');
          }
        }

        if (typeof auxValue === 'number') auxValue = auxValue.toString();

        // Set the dimension value to be sent to GA.
        model.set('dimension' + index, auxValue);
    });
  }

  /**
   * Removes a function added with setCustomDimension.
   * @param {string} index The index of your dimension as defined in your Google Analytics property settings.
   * @param {string} gaTaskName The name of the GA Task to add the taskFunction to.
   */
  unsetCustomDimension(index, gaTaskName = 'customTask') {
    const userTaskName = 'customDimension' + index;
    this.removeFunctionFromTask(gaTaskName, userTaskName);
  }

  /**
   * Resets all Tasks of the Tracker to the original function registered at the moment the plugin was required.
   */
  remove() {
    this.gaTaskNames.forEach((gaTaskName) => {
      const originalTaskFunction = this.registry[gaTaskName]['original'];
      this.tracker.set(gaTaskName, originalTaskFunction);
    });
  }
}

provide('gaTaskManager', GaTaskManager);
