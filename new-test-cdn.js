(function (window, document, $) {
  'use strict';

  var TDXFR = {
    version: '0.2.0',
    enabledMarkerSelector: '.tdxfr-enable',
    widgetSelector: '.tdxfr-widget',
    formSelector: 'form.js-entry-form',
    debug: false
  };

  if (!$) return;

  function log() {
    if (TDXFR.debug && window.console) {
      console.log.apply(console, arguments);
    }
  }

  function isLikelyTdxRequestForm($form) {
    var action = String($form.attr('action') || '');
    var path = String(window.location.pathname || '');

    return (
      action.indexOf('/Portal/Requests/TicketRequests/NewForm') >= 0 ||
      path.indexOf('/Portal/Requests/TicketRequests/NewForm') >= 0
    );
  }

  function shouldRun() {
    var $form = $(TDXFR.formSelector).first();

    if (!$form.length) return false;
    if (!isLikelyTdxRequestForm($form)) return false;
    if (!$form.find(TDXFR.enabledMarkerSelector).length) return false;
    if (!$form.find(TDXFR.widgetSelector).length) return false;
    if ($form.data('tdxfrInitialized')) return false;

    $form.data('tdxfrInitialized', true);
    return true;
  }

  function normalizeAttributeId(value) {
    value = String(value || '').trim();
    var match = value.match(/^f?(\d+)$/i);
    return match ? match[1] : null;
  }

  function getField(attributeId) {
    var id = normalizeAttributeId(attributeId);

    return {
      id: id,
      $group: $('#attribute' + id + '-grp, .form-group[data-fieldid="' + id + '"]').first(),
      $control: $('#attribute' + id).first()
    };
  }

  function parseConfigText(text) {
    var config = {};
    var parts = String(text || '').replace(/\s+/g, ' ').trim().split(';');

    parts.forEach(function (part) {
      part = $.trim(part);
      if (!part) return;

      var idx = part.indexOf('=');
      if (idx < 0) return;

      config[$.trim(part.slice(0, idx))] = $.trim(part.slice(idx + 1));
    });

    return config;
  }

  function parseColumns(columnsText) {
    return String(columnsText || '')
      .split('|')
      .map(function (rawColumn) {
        rawColumn = $.trim(rawColumn);
        if (!rawColumn) return null;

        var parts = rawColumn.split(':');

        var column = {
          label: $.trim(parts[0] || ''),
          key: makeKey(parts[0] || ''),
          type: $.trim(parts[1] || 'text').toLowerCase(),
          required: false,
          source: null,
          min: null,
          max: null
        };

        parts.slice(2).forEach(function (optionChunk) {
          optionChunk.split(',').forEach(function (option) {
            option = $.trim(option);
            if (!option) return;

            if (option === 'required') {
              column.required = true;
            } else if (option.indexOf('source=') === 0) {
              column.source = normalizeAttributeId(option.slice('source='.length));
            } else if (option.indexOf('min=') === 0) {
              column.min = parseOffset(option.slice('min='.length));
            } else if (option.indexOf('max=') === 0) {
              column.max = parseOffset(option.slice('max='.length));
            }
          });
        });

        return column;
      })
      .filter(Boolean);
  }

  function makeKey(label) {
    return String(label || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'field';
  }

  function parseOffset(value) {
    var match = String(value || '').trim().match(/^([+-])(\d+)(d|w|mo|y)$/i);
    if (!match) return null;

    return {
      direction: match[1] === '+' ? 1 : -1,
      amount: Number(match[2]),
      unit: match[3].toLowerCase()
    };
  }

  function todayDateOnly() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addOffset(baseDate, offset) {
    if (!offset) return null;

    var d = new Date(baseDate.getTime());
    var amount = offset.amount * offset.direction;

    if (offset.unit === 'd') d.setDate(d.getDate() + amount);
    if (offset.unit === 'w') d.setDate(d.getDate() + amount * 7);
    if (offset.unit === 'mo') d.setMonth(d.getMonth() + amount);
    if (offset.unit === 'y') d.setFullYear(d.getFullYear() + amount);

    d.setHours(0, 0, 0, 0);
    return d;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatUsDate(date) {
    if (!date) return '';
    return pad2(date.getMonth() + 1) + '/' + pad2(date.getDate()) + '/' + date.getFullYear();
  }

  function formatIsoDate(date) {
    if (!date) return '';
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function parseDate(value) {
    value = String(value || '').trim();
    if (!value) return null;

    var us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) {
      var usDate = new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));
      usDate.setHours(0, 0, 0, 0);
      return isNaN(usDate.getTime()) ? null : usDate;
    }

    var iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      var isoDate = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      isoDate.setHours(0, 0, 0, 0);
      return isNaN(isoDate.getTime()) ? null : isoDate;
    }

    return null;
  }

  function getSourceOptions(sourceAttributeId) {
    var source = getField(sourceAttributeId);
    var options = [];

    if (!source.$control.length || source.$control.prop('tagName').toLowerCase() !== 'select') {
      log('[TDXFR] Source select not found:', sourceAttributeId);
      return options;
    }

    source.$control.find('option').each(function () {
      var $option = $(this);
      var text = $.trim($option.text());
      var value = $option.attr('value') || '';

      options.push({
        value: value,
        text: text,
        isEmpty: $option.data('empty') === true || (!value && !text)
      });
    });

    return options;
  }

  function injectStyle() {
    if ($('#tdxfr-style').length) return;

    var css = [
      '.tdxfr-multirow-panel { margin: 12px 0 18px; }',
      '.tdxfr-multirow-panel .panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; }',
      '.tdxfr-multirow-panel .panel-title { font-size: 16px; font-weight: 600; }',
      '.tdxfr-multirow-panel table { margin-bottom: 10px; }',
      '.tdxfr-multirow-panel th { white-space: nowrap; }',
      '.tdxfr-multirow-panel .tdxfr-actions { width: 1%; white-space: nowrap; }',
      '.tdxfr-multirow-panel .tdxfr-help { margin: 6px 0 10px; color: #555; }',
      '.tdxfr-multirow-panel .tdxfr-storage-note { font-size: 12px; color: #666; margin-top: 6px; }',
      '.tdxfr-multirow-panel .tdxfr-error-list { display: none; margin-bottom: 10px; }',
      '.tdxfr-multirow-panel .tdxfr-row-error input,',
      '.tdxfr-multirow-panel .tdxfr-row-error select { border-color: #a94442; }',
      '.tdxfr-multirow-panel .tdxfr-required-mark { color: #a94442; }'
    ].join('\n');

    $('<style id="tdxfr-style" type="text/css"></style>').text(css).appendTo('head');
  }

  function buildWidget(widgetEl, config) {
    if (String(config.widget || '').toLowerCase() !== 'multirow') return;

    var targetId = normalizeAttributeId(config.target);
    var format = String(config.format || 'kv-lines').toLowerCase();
    var columns = parseColumns(config.columns);

    if (!targetId || !columns.length) return;

    var target = getField(targetId);
    if (!target.$control.length) return;

    var widgetId = 'tdxfr_' + targetId + '_' + Math.floor(Math.random() * 1000000);

    var $panel = $('<div class="tdxfr-multirow-panel panel panel-default"></div>');
    var $heading = $('<div class="panel-heading"></div>');
    var $title = $('<div class="panel-title">Multi-entry table</div>');
    var $addTop = $('<button type="button" class="btn btn-primary btn-sm">Add row</button>');
    var $body = $('<div class="panel-body"></div>');
    var $help = $('<div class="tdxfr-help">Add one row per entry. Values will be stored in the designated TDX field as newline text.</div>');
    var $errors = $('<div class="tdxfr-error-list alert alert-danger"></div>');
    var $table = $('<table class="table table-bordered table-condensed"></table>');
    var $thead = $('<thead></thead>');
    var $tbody = $('<tbody></tbody>');
    var $headRow = $('<tr></tr>');

    columns.forEach(function (col) {
      $headRow.append(
        '<th>' + col.label + (col.required ? ' <span class="tdxfr-required-mark">*</span>' : '') + '</th>'
      );
    });

    $headRow.append('<th class="tdxfr-actions">Actions</th>');
    $thead.append($headRow);
    $table.append($thead).append($tbody);

    var $addBottom = $('<button type="button" class="btn btn-default btn-sm">Add row</button>');

    $heading.append($title).append($addTop);
    $body.append($help).append($errors).append($table).append($addBottom);
    $panel.append($heading).append($body);

    $(widgetEl).after($panel);

    target.$group.hide().addClass('tdxfr-storage-hidden-by-widget');

    function addRow(rowData) {
      rowData = rowData || {};

      var $tr = $('<tr></tr>');

      columns.forEach(function (col) {
        var $td = $('<td></td>').attr('data-label', col.label);
        var $control = createColumnControl(col, rowData[col.label]);

        $control
          .attr('data-tdxfr-key', col.key)
          .attr('data-tdxfr-label', col.label)
          .on('change keyup blur', function () {
            serializeToTarget();
            validateWidget(false);
          });

        $td.append($control);
        $tr.append($td);
      });

      var $remove = $('<button type="button" class="btn btn-danger btn-xs">Remove</button>');
      $remove.on('click', function () {
        $tr.remove();
        serializeToTarget();
        validateWidget(false);

        if (!$tbody.find('tr').length) addRow({});
      });

      $tr.append($('<td class="tdxfr-actions"></td>').append($remove));
      $tbody.append($tr);

      initDatepickersInRow($tr);
      serializeToTarget();
    }

    function createColumnControl(col, existingValue) {
      var existing = existingValue == null ? '' : String(existingValue);

      if (col.type === 'select') {
        var $select = $('<select class="form-control"></select>');
        var options = getSourceOptions(col.source);

        options.forEach(function (option) {
          var $opt = $('<option></option>').attr('value', option.value).text(option.text);
          if (option.isEmpty) $opt.attr('data-empty', 'true');
          $select.append($opt);
        });

        $select.val(existing);
        return $select;
      }

      if (col.type === 'date') {
        return $('<input type="text" class="form-control datepicker" autocomplete="off">').val(existing);
      }

      return $('<input type="text" class="form-control">').val(existing);
    }

    function initDatepickersInRow($tr) {
      $tr.find('input.datepicker').each(function () {
        var $input = $(this);
        var label = $input.attr('data-tdxfr-label');
        var col = columns.filter(function (c) { return c.label === label; })[0];

        if (!col) return;

        var today = todayDateOnly();
        var minDate = addOffset(today, col.min);
        var maxDate = addOffset(today, col.max);

        if ($.fn.datepicker) {
          $input.datepicker({
            dateFormat: 'mm/dd/yy',
            minDate: minDate || null,
            maxDate: maxDate || null
          });
        } else {
          $input.attr('type', 'date');
          if (minDate) $input.attr('min', formatIsoDate(minDate));
          if (maxDate) $input.attr('max', formatIsoDate(maxDate));
        }
      });
    }

    function getControlDisplayValue($control) {
      if ($control.prop('tagName').toLowerCase() === 'select') {
        return $.trim($control.find('option:selected').text());
      }

      return $.trim($control.val());
    }

    function serializeToTarget() {
      var rows = [];

      $tbody.find('tr').each(function () {
        var row = {};
        var hasAnyValue = false;

        $(this).find('[data-tdxfr-label]').each(function () {
          var $control = $(this);
          var label = $control.attr('data-tdxfr-label');
          var value = getControlDisplayValue($control);

          if (value) hasAnyValue = true;
          row[label] = value;
        });

        if (hasAnyValue) rows.push(row);
      });

      var serialized = rows.map(function (row) {
        return columns.map(function (col) {
          if (format === 'pipe-kv-lines') {
            return col.label + '=' + (row[col.label] || '');
          }

          return col.label + ': ' + (row[col.label] || '');
        }).join(format === 'pipe-kv-lines' ? ' | ' : ', ');
      }).join('\n');

      target.$control.val(serialized).trigger('change');
      return serialized;
    }

    function validateWidget(showErrors) {
      var errors = [];

      $tbody.find('tr').removeClass('tdxfr-row-error');

      $tbody.find('tr').each(function (rowIndex) {
        var $row = $(this);
        var rowNumber = rowIndex + 1;
        var rowHasError = false;

        columns.forEach(function (col) {
          var $control = $row.find('[data-tdxfr-key="' + col.key + '"]');
          var value = getControlDisplayValue($control);

          if (col.required && !value) {
            errors.push('Row ' + rowNumber + ': ' + col.label + ' is required.');
            rowHasError = true;
          }

          if (col.type === 'date' && value) {
            var selected = parseDate(value);
            var today = todayDateOnly();
            var minDate = addOffset(today, col.min);
            var maxDate = addOffset(today, col.max);

            if (!selected) {
              errors.push('Row ' + rowNumber + ': ' + col.label + ' must be a valid date.');
              rowHasError = true;
            } else {
              if (minDate && selected < minDate) {
                errors.push('Row ' + rowNumber + ': ' + col.label + ' must be on or after ' + formatUsDate(minDate) + '.');
                rowHasError = true;
              }

              if (maxDate && selected > maxDate) {
                errors.push('Row ' + rowNumber + ': ' + col.label + ' must be on or before ' + formatUsDate(maxDate) + '.');
                rowHasError = true;
              }
            }
          }
        });

        if (rowHasError) $row.addClass('tdxfr-row-error');
      });

      if (errors.length && showErrors) {
        $errors.html('<strong>Please correct the following:</strong><ul><li>' + errors.join('</li><li>') + '</li></ul>').show();
      } else if (!errors.length) {
        $errors.hide().empty();
      }

      return errors.length === 0;
    }

    $addTop.add($addBottom).on('click', function () {
      addRow({});
    });

    addRow({});

    $('form.js-entry-form')
      .off('submit.' + widgetId)
      .on('submit.' + widgetId, function (e) {
        serializeToTarget();

        if (!validateWidget(true)) {
          e.preventDefault();
          e.stopImmediatePropagation();

          if ($.fn.progressButton) $('#btnSubmit').progressButton('reset');

          $('html, body').animate({ scrollTop: $panel.offset().top - 80 }, 150);
          return false;
        }
      });
  }

  function initWidgets() {
    injectStyle();

    var $form = $(TDXFR.formSelector).first();

    $form.find(TDXFR.widgetSelector).each(function () {
      var config = parseConfigText($(this).text());
      buildWidget(this, config);
    });
  }

  function init() {
    if (!shouldRun()) return;
    initWidgets();
  }

  if (document.readyState === 'loading') {
    $(init);
  } else {
    init();
  }

})(window, document, window.jQuery);
