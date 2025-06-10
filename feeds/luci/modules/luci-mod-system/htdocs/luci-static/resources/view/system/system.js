'use strict';
'require view';
'require poll';
'require ui';
'require uci';
'require rpc';
'require form';
'require tools.widgets as widgets';

var callRcList, callRcInit, callTimezone,
    callGetLocaltime, callSetLocaltime, CBILocalTime;

// 새로운 시간 row를 위한 div 생성 (updateUI보다 위에 선언)
var newTimeRow = E('div', {});

callRcList = rpc.declare({
	object: 'rc',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} },
	filter: function(res) {
		for (var k in res)
			return +res[k].enabled;
		return null;
	}
});

callRcInit = rpc.declare({
	object: 'rc',
	method: 'init',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

callGetLocaltime = rpc.declare({
	object: 'system',
	method: 'info',
	expect: { localtime: 0 }
});

callSetLocaltime = rpc.declare({
	object: 'luci',
	method: 'setLocaltime',
	params: [ 'localtime' ],
	expect: { result: 0 }
});

callTimezone = rpc.declare({
	object: 'luci',
	method: 'getTimezones',
	expect: { '': {} }
});

function formatTime(epoch) {
	var date = new Date(epoch * 1000);

	return '%04d-%02d-%02d %02d:%02d:%02d'.format(
		date.getUTCFullYear(),
		date.getUTCMonth() + 1,
		date.getUTCDate(),
		date.getUTCHours(),
		date.getUTCMinutes(),
		date.getUTCSeconds()
	);
}

CBILocalTime = form.DummyValue.extend({
	renderWidget: function(section_id, option_id, cfgvalue) {
		var self = this;
		var modeSelect, dateInput, timeInput, dateText, timeText, periodSelect, ntpInput, localSelect, localInput, autoCheckbox, container, dashPeriod, dashNtp, dashLocal;

		function getCurrentDateTime() {
			var now = new Date();
			var yyyy = now.getFullYear();
			var mm = String(now.getMonth() + 1).padStart(2, '0');
			var dd = String(now.getDate()).padStart(2, '0');
			var hh = String(now.getHours()).padStart(2, '0');
			var min = String(now.getMinutes()).padStart(2, '0');
			var ss = String(now.getSeconds()).padStart(2, '0');
			return {
				date: yyyy + '-' + mm + '-' + dd,
				time: hh + ':' + min + ':' + ss
			};
		}

		function updateUI() {
			var mode = modeSelect.value;
			var current = getCurrentDateTime();
			// 새로운 시간 row 동적 갱신
			newTimeRow.innerHTML = '';
			if (mode === 'ntp') {
				dateText.textContent = current.date;
				timeText.textContent = current.time;
				newTimeRow.appendChild(row('Current Time', dateText));
				newTimeRow.appendChild(row(' ', timeText));
			} else {
				newTimeRow.appendChild(row('New Time', dateInput));
				newTimeRow.appendChild(row(' ', timeInput));
			}
			updateLocalAddrUI();
		}

		// 요소 생성
		modeSelect = E('select', { 'style': 'width: 140px; margin-bottom:12px;' }, [
			E('option', { 'value': 'ntp' }, '타임 서버 사용'),
			E('option', { 'value': 'manual' }, '수동 설정')
		]);
		dateInput = E('input', { 'type': 'date', 'style': 'width:140px; margin-bottom:6px;' });
		timeInput = E('input', { 'type': 'time', 'style': 'width:140px;' });
		dateText = E('div', { 'id': 'localtime', 'style': 'width:140px; margin-bottom:6px;' });
		timeText = E('div', { 'style': 'width:140px;' });
		periodSelect = E('select', { 'style': 'width:140px;' }, [
			E('option', { 'value': 'day' }, '하루'),
			E('option', { 'value': 'hour' }, '1시간'),
			E('option', { 'value': 'minute' }, '1분')
		]);
		ntpInput = E('input', { 'type': 'text', 'style': 'width:140px;' });
		localSelect = E('select', { 'style': 'width:140px;', 'disabled': true }, [
			E('option', { 'value': '172.16.0.1', 'selected': true }, '172.16.0.1')
		]);
		localInput = E('input', { 'type': 'text', 'style': 'width:140px; display:none;' });
		dashPeriod = E('span', { 'style': 'font-size:16px;' }, '-');
		dashNtp = E('span', { 'style': 'font-size:16px;' }, '-');
		dashLocal = E('span', { 'style': 'font-size:16px;' }, '-');
		autoCheckbox = E('input', { 'type': 'checkbox', 'checked': true, 'style': 'margin-left:8px;' });

		// Read current NTP setting from /etc/config/system
		var ntpEnabled = uci.get('system', 'timeserver', 'enabled');
		if (ntpEnabled === '1') {
			modeSelect.value = 'ntp';
		} else {
			modeSelect.value = 'manual';
		}

		// Add save functionality
		modeSelect.addEventListener('change', function() {
			var value = this.value;
			if (value === 'ntp') {
				uci.set('system', 'timeserver', 'enabled', '1');
			} else {
				uci.set('system', 'timeserver', 'enabled', '0');
			}
			uci.save();
			uci.apply();
		});

		// 수동설정 시 시간 적용 함수
		function setManualTime() {
			if (modeSelect.value === 'manual') {
				var dateVal = dateInput.value;
				var timeVal = timeInput.value;
				if (dateVal && timeVal) {
					var dateTimeStr = dateVal + 'T' + timeVal;
					var epoch = Math.floor(new Date(dateTimeStr).getTime() / 1000);
					callSetLocaltime(epoch);
				}
			}
		}

		// 저장&적용 버튼에 수동 시간 적용 연결 (폼 저장 시)
		if (window.L && L.ui && L.ui.addSaveHook) {
			L.ui.addSaveHook(setManualTime);
		}

		// --- NTP 서버 주소 불러오기 ---
		var ntpServers = uci.get('system', 'timeserver', 'server');
		if (ntpServers && ntpServers.length > 0) {
			ntpInput.value = ntpServers[0];
		} else {
			ntpInput.value = 'kr.pool.ntp.org';
		}

		// 입력폼 값이 바뀔 때마다 UI를 즉시 갱신
		modeSelect.addEventListener('change', updateUI);
		dateInput.addEventListener('input', updateUI);
		timeInput.addEventListener('input', updateUI);
		ntpInput.addEventListener('input', updateUI);

		// 자동 체크박스 이벤트
		function updateLocalAddrUI() {
			if (autoCheckbox.checked) {
				localSelect.style.display = '';
				localInput.style.display = 'none';
				// 드롭다운 값에 현재 타임서버 주소 반영
				var ntpVal = ntpInput.value || '172.16.0.1';
				localSelect.options[0].text = ntpVal;
				localSelect.options[0].value = ntpVal;
			} else {
				localSelect.style.display = 'none';
				localInput.style.display = '';
			}
		}
		autoCheckbox.addEventListener('change', updateLocalAddrUI);

		function row(label, input) {
			return E('div', {
				'style': 'display:flex; align-items:center; margin-bottom:8px;'
			}, [
				E('div', { 'style': 'width:110px; text-align:right; font-weight:bold; margin-right:50px;' }, label),
				input
			]);
		}

		container = E('div', { 'style': 'font-size:12px; max-width:350px; padding:16px 0 0 0;' }, [
			row('시간설정', modeSelect),
			newTimeRow,
			row('적용주기', periodSelect),
			row('타임서버의 주소', ntpInput),
			row('로컬 주소', E('div', {}, [localSelect, localInput, autoCheckbox, E('span', { 'style': 'margin-left:4px;' }, '자동')]))
		]);

		updateUI();
		return container;
	},
});

return view.extend({
	load: function() {
		return Promise.all([
			callRcList('sysntpd'),
			callTimezone(),
			callGetLocaltime(),
			uci.load('luci'),
			uci.load('system')
		]);
	},

	render: function(rpc_replies) {
		var ntpd_enabled = rpc_replies[0],
		    timezones = rpc_replies[1],
		    localtime = rpc_replies[2],
		    m, s, o;

		// Add local style for uniform tab width
		var tabStyle = E('style', {}, `
.cbi-tabmenu > li {
  min-width: 120px;
  max-width: 120px;
  flex: 0 0 120px !important;
  justify-content: center;
  text-align: center;
}
.cbi-tabmenu > li > a {
  width: 100%;
  text-align: center;
}
`);

		// 1. 시스템 정보 DIV 생성
		var systemInfoDiv = E('div', { 'style': 'margin-bottom: 16px; background: #f7f7f7; padding: 12px; border-radius: 4px; border: 1px solid #e0e0e0;' }, [
			E('span', { 'style': 'font-weight: bold; color: #005fae;' }, '[시스템] - [정보]'),
			E('div', { 'style': 'margin-top: 8px; font-size: 15px; color: #222;' }, [
				E('span', {}, '제품 고유 번호 : M22-e-S0006-2492'),
				E('span', { 'style': 'margin-left: 40px;' }, '펌웨어 버전 : XIOS FW V2.1(r32998)')
			])
		]);

		// 2. 기존 폼 생성
		m = new form.Map('system',
			_('System'),
			_('Here you can configure the basic aspects of your device like its hostname or the timezone.'));

		m.chain('luci');

		s = m.section(form.TypedSection, 'system', _('System Properties'));
		s.anonymous = true;
		s.addremove = false;

		s.tab('Time', _('Time'));
		s.tab('hostname_dns', _('Hostname & DNS'));
		s.tab('logging', _('Logging'));
		s.tab('timesync', _('Time Synchronization'));


		/*
		 * System Properties
		 */

		s.taboption('Time', form.DummyValue, '_custom_time', '', '').renderWidget = function(section_id, option_id, cfgvalue) {
			var self = this;
			var modeSelect, dateInput, timeInput, dateText, timeText, periodSelect, ntpInput, localSelect, localInput, autoCheckbox, container;

			function getCurrentDateTime() {
				var now = new Date();
				var yyyy = now.getFullYear();
				var mm = String(now.getMonth() + 1).padStart(2, '0');
				var dd = String(now.getDate()).padStart(2, '0');
				var hh = String(now.getHours()).padStart(2, '0');
				var min = String(now.getMinutes()).padStart(2, '0');
				var ss = String(now.getSeconds()).padStart(2, '0');
				return {
					date: yyyy + '-' + mm + '-' + dd,
					time: hh + ':' + min + ':' + ss
				};
			}

			function updateUI() {
				var mode = modeSelect.value;
				var current = getCurrentDateTime();
				// 새로운 시간 row 동적 갱신
				newTimeRow.innerHTML = '';
				if (mode === 'ntp') {
					dateText.textContent = current.date;
					timeText.textContent = current.time;
					newTimeRow.appendChild(row('Current Time', dateText));
					newTimeRow.appendChild(row(' ', timeText));
				} else {
					newTimeRow.appendChild(row('New Time', dateInput));
					newTimeRow.appendChild(row(' ', timeInput));
				}
				updateLocalAddrUI();
			}

			// 요소 생성
			modeSelect = E('select', { 'style': 'width: 140px; margin-bottom:12px;' }, [
				E('option', { 'value': 'ntp' }, '타임 서버 사용'),
				E('option', { 'value': 'manual' }, '수동 설정')
			]);
			dateInput = E('input', { 'type': 'date', 'style': 'width:140px; margin-bottom:6px;' });
			timeInput = E('input', { 'type': 'time', 'style': 'width:140px;' });
			dateText = E('div', { 'id': 'localtime', 'style': 'width:140px; margin-bottom:6px;' });
			timeText = E('div', { 'style': 'width:140px;' });
			periodSelect = E('select', { 'style': 'width:140px;' }, [
				E('option', { 'value': 'day' }, '하루'),
				E('option', { 'value': 'hour' }, '1시간'),
				E('option', { 'value': 'minute' }, '1분')
			]);
			ntpInput = E('input', { 'type': 'text', 'style': 'width:140px;' });
			localSelect = E('select', { 'style': 'width:140px;', 'disabled': true }, [
				E('option', { 'value': '172.16.0.1', 'selected': true }, '172.16.0.1')
			]);
			localInput = E('input', { 'type': 'text', 'style': 'width:140px; display:none;' });
			autoCheckbox = E('input', { 'type': 'checkbox', 'checked': true, 'style': 'margin-left:8px;' });

			// --- NTP 서버 주소 불러오기 ---
			var ntpServers = uci.get('system', 'ntp', 'server');
			if (ntpServers && ntpServers.length > 0) {
				ntpInput.value = ntpServers[0];
			} else {
				ntpInput.value = 'kr.pool.ntp.org';
			}

			// 입력폼 값이 바뀔 때마다 UI를 즉시 갱신
			modeSelect.addEventListener('change', updateUI);
			dateInput.addEventListener('input', updateUI);
			timeInput.addEventListener('input', updateUI);
			ntpInput.addEventListener('input', updateUI);

			// 자동 체크박스 이벤트
			function updateLocalAddrUI() {
				if (autoCheckbox.checked) {
					localSelect.style.display = '';
					localInput.style.display = 'none';
					// 드롭다운 값에 현재 타임서버 주소 반영
					var ntpVal = ntpInput.value || '172.16.0.1';
					localSelect.options[0].text = ntpVal;
					localSelect.options[0].value = ntpVal;
				} else {
					localSelect.style.display = 'none';
					localInput.style.display = '';
				}
			}
			autoCheckbox.addEventListener('change', updateLocalAddrUI);

			function row(label, input) {
				return E('div', {
					'style': 'display:flex; align-items:center; margin-bottom:8px;'
				}, [
					E('div', { 'style': 'width:110px; text-align:right; font-weight:bold; margin-right:50px;' }, label),
					input
				]);
			}

			container = E('div', { 'style': 'font-size:12px; max-width:350px; padding:16px 0 0 0;' }, [
				row('시간설정', modeSelect),
				newTimeRow,
				row('적용주기', periodSelect),
				row('타임서버의 주소', ntpInput),
				row('로컬 주소', E('div', {}, [localSelect, localInput, autoCheckbox, E('span', { 'style': 'margin-left:4px;' }, '자동')]))
			]);

			updateUI();
			return container;
		};

		s.taboption('hostname_dns', form.DummyValue, '_custom_hostname_dns', '', '').renderWidget = function() {
			function row(label, input, labelStyle, inputStyle) {
				return E('div', {
					'style': 'display:flex; align-items:center; margin-bottom:12px;'
				}, [
					E('div', { 'style': (labelStyle || 'width:130px; text-align:right; font-weight:bold; margin-right:12px;') }, label),
					E('div', { 'style': (inputStyle || '') }, input)
				]);
			}
			return E('div', { 'style': 'padding: 16px 0 0 0; max-width: 400px; font-size:12px;' }, [
				row(
					'게이트웨이 이름',
					[
						E('input', { 'type': 'text', 'value': 'XECUREGATEWAY', 'style': 'width:180px; margin-right:8px;' }),
						E('button', { 'class': 'cbi-button', 'style': 'width:90px;' }, '이름 적용')
					]
				),
				row(
					'도메인 네임 서버(DNS)',
					E('div', {}, [
						E('input', { 'type': 'text', 'value': '164.124.101.2', 'style': 'width:220px; margin-bottom:6px; display:block;' }),
						E('input', { 'type': 'text', 'value': '168.126.63.1', 'style': 'width:220px; margin-bottom:6px; display:block;' }),
						E('input', { 'type': 'text', 'value': '', 'style': 'width:220px; margin-bottom:6px; display:block;' })
					]),
					'width:130px; text-align:right; font-weight:bold; margin-right:12px; margin-top:0;',
					'display:flex; flex-direction:column;'
				),
				E('div', { 'style': 'display:flex; justify-content:center; margin-top:12px;' }, [
					E('button', { 'class': 'cbi-button', 'style': 'width:220px;' }, '네임서버 적용')
				])
			]);
		}

		var o_hostname = s.taboption('hostname_dns', form.Value, 'hostname', _('호스트 이름'));
		o_hostname.datatype = 'hostname';

		/*
		 * Logging
		 */

		o = s.taboption('logging', form.Value, 'log_size', _('System log buffer size'), "kiB");
		o.optional    = true;
		o.placeholder = 128;
		o.datatype    = 'uinteger';

		o = s.taboption('logging', form.Value, 'log_ip', _('External system log server'));
		o.optional    = true;
		o.placeholder = '0.0.0.0';
		o.datatype    = 'host';

		o = s.taboption('logging', form.Value, 'log_port', _('External system log server port'));
		o.optional    = true;
		o.placeholder = 514;
		o.datatype    = 'port';

		o = s.taboption('logging', form.ListValue, 'log_proto', _('External system log server protocol'));
		o.value('udp', 'UDP');
		o.value('tcp', 'TCP');

		o = s.taboption('logging', form.Value, 'log_file', _('Write system log to file'));
		o.optional    = true;
		o.placeholder = '/tmp/system.log';

		o = s.taboption('logging', form.ListValue, 'conloglevel', _('Log output level'), _('Only affects dmesg kernel log'));
		o.value(8, _('Debug'));
		o.value(7, _('Info'));
		o.value(6, _('Notice'));
		o.value(5, _('Warning'));
		o.value(4, _('Error'));
		o.value(3, _('Critical'));
		o.value(2, _('Alert'));
		o.value(1, _('Emergency'));

		o = s.taboption('logging', form.ListValue, 'cronloglevel', _('Cron Log Level'));
		o.default = 7;
		o.value(7, _('Normal'));
		o.value(9, _('Disabled'));
		o.value(5, _('Debug'));

		// 적용(저장) 시 로컬주소 저장 로직 추가
		var saveLocalAddr = function() {
			var ip = autoCheckbox.checked ? localSelect.value : localInput.value;
			uci.set('system', 'localserver', ip);
		};

		// 3. 폼 렌더링 후 시스템 정보 DIV를 설명 아래에 추가
		return m.render().then(function(mapEl) {
			var descr = mapEl.querySelector('.cbi-map-descr');
			if (descr) {
				descr.parentNode.insertBefore(systemInfoDiv, descr.nextSibling);
			}
			// Insert tab style at the top of the map element
			mapEl.insertBefore(tabStyle, mapEl.firstChild);
			poll.add(function() {
				return callGetLocaltime().then(function(t) {
					var localtimeEl = mapEl.querySelector('#localtime');
					if (localtimeEl) {
						localtimeEl.textContent = formatTime(t);
					}
				});
			});
			return mapEl;
		});
	}
});
