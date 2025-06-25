'use strict';
'require view';
'require poll';
'require ui';
'require uci';
'require rpc';
'require form';
'require tools.widgets as widgets';

var callRcList, callRcInit, callTimezone,
    callGetLocaltime, callSetLocaltime;

// 새로운 시간 row를 위한 div 생성 (updateUI보다 위에 선언)
var newTimeRow = E('div', {});

// 폼 표준 row 함수: 파일 최상단에 선언
function row(label, input) {
	var field = E('div', { class: 'cbi-value-field' });
	if (Array.isArray(input)) {
		input.forEach(function(i) { field.appendChild(i); });
	} else {
		field.appendChild(input);
	}
	return E('div', { class: 'cbi-value' }, [
		E('label', { class: 'cbi-value-title' }, label),
		field
	]);
}


function makeTimeRows(label, dateStr, timeStr) {
	return [
		row(label, E('div', {}, dateStr)),
		row('', E('div', {}, timeStr))
	];
}

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
	params: [ 'localtime' ]
});

callTimezone = rpc.declare({
	object: 'luci',
	method: 'getTimezones',
	expect: { '': {} }
});

return view.extend({
	load: function() {
		return Promise.all([
			callRcList('sysntpd'),
			callTimezone(),
			callGetLocaltime(),
			uci.load('luci'),
			uci.load('system'),
			uci.load('network')
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


		/*
		 * System Properties
		 */

		s.taboption('Time', form.DummyValue, '_custom_time', '', '').renderWidget = function(section_id, option_id, cfgvalue) {
			var self = this;
			var modeSelect, dateInput, timeInput, periodSelect, ntpInput, localSelect, localInput, autoCheckbox, container;

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
				newTimeRow.innerHTML = '';
				if (mode === 'ntp') {
					var rows = makeTimeRows('Current Time', current.date, current.time);
					rows.forEach(function(r) { newTimeRow.appendChild(r); });
					
					// NTP 모드시 관련 요소들 활성화
					periodSelect.disabled = false;
					ntpInput.disabled = false;
					localSelect.disabled = false;
					localInput.disabled = false;
					autoCheckbox.disabled = false;
				} else {
					newTimeRow.appendChild(row('New Time', dateInput));
					newTimeRow.appendChild(row(' ', timeInput));
					
					// 수동 모드시 NTP 관련 요소들 비활성화
					periodSelect.disabled = true;
					ntpInput.disabled = true;
					localSelect.disabled = true;
					localInput.disabled = true;
					autoCheckbox.disabled = true;
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
			periodSelect = E('select', { 'style': 'width:140px;' }, [
				E('option', { 'value': '60' }, '1분'),
				E('option', { 'value': '3600' }, '1시간'),
				E('option', { 'value': '86400' }, '하루')
			]);
			ntpInput = E('input', { 'type': 'text', 'style': 'width:140px;' });
			localSelect = E('select', { 'style': 'width:140px;', 'disabled': true }, [
				E('option', { 'value': '172.16.0.1', 'selected': true }, '172.16.0.1')
			]);
			localInput = E('input', { 'type': 'text', 'style': 'width:140px; display:none;' });
			autoCheckbox = E('input', { 'type': 'checkbox', 'checked': true, 'style': 'margin-left:8px;' });

			// Read current NTP setting from /etc/config/system
			var ntpEnabled = uci.get('system', 'ntp', 'enabled');
			if (ntpEnabled === '1') {
				modeSelect.value = 'ntp';
			} else {
				modeSelect.value = 'manual';
			}

			// Add save functionality
			modeSelect.addEventListener('change', function() {
				var value = this.value;
				if (value === 'ntp') {
					uci.set('system', 'ntp', 'enabled', '1');
					// 수동 설정 기록 제거
					uci.unset('system', 'ntp', 'manual_time_set');
					uci.unset('system', 'ntp', 'manual_time_timestamp');
					uci.unset('system', 'ntp', 'manual_time_date');
					// NTP 활성화시 설정 적용
					saveNtpSettings();
				} else {
					uci.set('system', 'ntp', 'enabled', '0');
					// 수동 모드시 cron 작업 제거
					uci.unset('system', 'ntp', 'cron_entry');
					
					// /etc/crontabs/root에서 NTP cron 작업 제거
					L.resolveDefault(L.rpc.declare({
						object: 'file',
						method: 'exec',
						params: ['command']
					})('grep -v "ntpd.*-q.*-p" /etc/crontabs/root 2>/dev/null > /tmp/crontab.tmp || true && mv /tmp/crontab.tmp /etc/crontabs/root')).then(function() {
						return callRcInit('cron', 'restart');
					});
					
					uci.save();
					uci.apply();
				}
			});

			// 수동설정 시 시간 적용 함수
			function setManualTime() {
				if (modeSelect.value === 'manual') {
					var dateVal = dateInput.value;
					var timeVal = timeInput.value;
					if (dateVal && timeVal) {
						var dateTimeStr = dateVal + 'T' + timeVal;
						var epoch = Math.floor(new Date(dateTimeStr).getTime() / 1000);

						// 시스템 시간 설정 (Promise 처리)
						return callSetLocaltime(epoch).then(function(result) {
							// 백엔드에서 result 값 확인 (실제 설정된 timestamp인지 검증)
							if (result && result.result === epoch) {
								// UCI에 수동 설정 완료 기록
								uci.set('system', 'ntp', 'enabled', '0');
								uci.set('system', 'ntp', 'manual_time_set', '1');
								uci.set('system', 'ntp', 'manual_time_timestamp', epoch.toString());
								uci.set('system', 'ntp', 'manual_time_date', dateTimeStr);
							} else {
								console.error('Time setting failed - backend returned unexpected result:', result);
								if (typeof ui !== 'undefined' && ui.addNotification) {
									ui.addNotification(null, E('p', '시간 설정 실패: 백엔드 오류'));
								}
							}

							return result;
						}).catch(function(error) {
							console.error('callSetLocaltime failed:', error);
							if (typeof ui !== 'undefined' && ui.addNotification) {
								ui.addNotification(null, E('p', '시간 설정 실패: ' + (error.message || error)));
							}
							throw error;
						});
					} else {
						console.log('Date or time value missing');
						if (typeof ui !== 'undefined' && ui.addNotification) {
							ui.addNotification(null, E('p', '날짜와 시간을 모두 입력해주세요'));
						}
					}
				}
			}

			// 저장&적용 버튼에 수동 시간 적용 연결 (폼 저장 시)
			if (window.L && L.ui && L.ui.addSaveHook) {
				L.ui.addSaveHook(setManualTime);
			}

			// --- NTP 서버 주소 불러오기 ---
			var ntpServers = uci.get('system', 'ntp', 'server');
			if (ntpServers && ntpServers.length > 0) {
				ntpInput.value = ntpServers[0];
			} else {
				ntpInput.value = 'kr.pool.ntp.org';
			}

			// --- 적용주기 불러오기 ---
			var updateInterval = uci.get('system', 'ntp', 'update_interval');
			if (updateInterval) {
				periodSelect.value = updateInterval;
			} else {
				periodSelect.value = '3600'; // 기본값: 1시간
			}

			// 초기 로드시 NTP가 활성화되어 있으면 cron 설정
			if (ntpEnabled === '1') {
				saveNtpSettings();
			}

			// NTP 서버 주소와 적용주기 저장 (cron 방식)
			function saveNtpSettings() {
				if (modeSelect.value === 'ntp') {
					var ntpAddress = ntpInput.value || 'kr.pool.ntp.org';
					var localAddress = autoCheckbox.checked ? localSelect.value : localInput.value;
					var period = periodSelect.value || '3600';
					
					// 현재 설정 확인
					var currentServers = uci.get('system', 'ntp', 'server') || [];
					var currentPeriod = uci.get('system', 'ntp', 'update_interval') || '3600';
					var currentServer = currentServers.length > 0 ? currentServers[0] : 'kr.pool.ntp.org';
					
					// 변경된 경우에만 업데이트
					if (currentServer !== ntpAddress || currentPeriod !== period) {
						// UCI 설정 저장
						uci.set('system', 'ntp', 'server', [ntpAddress]);
						uci.set('system', 'ntp', 'update_interval', period);
						
						// cron 작업 생성 및 파일에 저장
						var cronEntry = '';
						// localAddress 사용하여 ntpd 명령 구성
						var ntpdCmd = '/usr/sbin/ntpd -q -p ' + ntpAddress;
						if (localAddress && localAddress !== '') {
							ntpdCmd += ' -b ' + localAddress;
						}

						if (period === '60') { // 1분
							cronEntry = '* * * * * ' + ntpdCmd;
						} else if (period === '3600') { // 1시간  
							cronEntry = '0 * * * * ' + ntpdCmd;
						} else if (period === '86400') { // 하루
							cronEntry = '0 0 * * * ' + ntpdCmd;
						}

						if (cronEntry) {
							// UCI에 저장
							uci.set('system', 'ntp', 'cron_entry', cronEntry);

							// /etc/crontabs/root 파일에 NTP cron 작업 추가/업데이트
							L.resolveDefault(L.rpc.declare({
								object: 'file',
								method: 'write',
								params: ['path', 'data']
							})('/etc/crontabs/root', cronEntry + '\n')).then(function() {
								// cron 서비스 재시작
								return callRcInit('cron', 'restart');
							});
						}
					}
				}
			}

			// 입력폼 값이 바뀔 때마다 UI를 즉시 갱신
			modeSelect.addEventListener('change', updateUI);
			dateInput.addEventListener('input', function() {
				updateUI();
				// 수동 시간 입력 시 더미 UCI 값 변경하여 저장 필요 상태로 만들기
				if (modeSelect.value === 'manual') {
					var timestamp = Date.now().toString();
					uci.set('system', 'ntp', 'manual_time_input', timestamp);
				}
			});
			timeInput.addEventListener('input', function() {
				updateUI();
				// 수동 시간 입력 시 더미 UCI 값 변경하여 저장 필요 상태로 만들기
				if (modeSelect.value === 'manual') {
					var timestamp = Date.now().toString();
					uci.set('system', 'ntp', 'manual_time_input', timestamp);
				}
			});

			// 수동 설정에서 날짜/시간 변경 시 즉시 적용하는 이벤트 추가
			dateInput.addEventListener('change', function() {
				if (modeSelect.value === 'manual' && dateInput.value && timeInput.value) {
					console.log('Date input changed, applying immediately');
					setManualTime();
				}
			});
			timeInput.addEventListener('change', function() {
				if (modeSelect.value === 'manual' && dateInput.value && timeInput.value) {
					console.log('Time input changed, applying immediately');
					setManualTime();
				}
			});

			ntpInput.addEventListener('change', saveNtpSettings);
			periodSelect.addEventListener('change', saveNtpSettings);

			// 자동 체크박스 이벤트
			function updateLocalAddrUI() {
				if (autoCheckbox.checked) {
					localSelect.style.display = '';
					localSelect.disabled = true; // 자동 모드에서는 비활성화
					localInput.style.display = 'none';
					// 드롭다운 값에 현재 타임서버 주소 반영
					var ntpVal = ntpInput.value || '172.16.0.1';
					localSelect.options[0].text = ntpVal;
					localSelect.options[0].value = ntpVal;
				} else {
					localSelect.style.display = 'none';
					localInput.style.display = '';
					localInput.disabled = false; // 수동 입력 모드에서는 활성화
				}
			}
			autoCheckbox.addEventListener('change', updateLocalAddrUI);

			container = E('div', { 'style': 'font-size:12px; width:100%; padding:16px 0 0 0;' }, [
				row('시간설정', modeSelect),
				newTimeRow,
				row('적용주기', periodSelect),
				row('타임서버의 주소', ntpInput),
				row('로컬 주소', E('div', {}, [localSelect, localInput, autoCheckbox, E('span', { 'style': 'margin-left:4px;' }, '자동')]))
			]);

			updateUI();
			return container;
		};

		// 히든 호스트네임 필드로 폼 저장 시 처리되도록 함
		var hostnameOption = s.option(form.Value, 'hostname', '');
		hostnameOption.rmempty = false;
		hostnameOption.datatype = 'hostname';
		hostnameOption.load = function(section_id) {
			var hostname = uci.get('system', '@system[0]', 'hostname') || 'UI-2PV';
			console.log('[Hostname] Load:', { 
				section_id: section_id, 
				hostname: hostname,
				section: s,
				option: this
			});
			return hostname;
		};
		hostnameOption.write = function(section_id, value) {
			console.log('[Hostname] Write:', { 
				section_id: section_id, 
				value: value,
				section: s,
				option: this
			});
			uci.set('system', '@system[0]', 'hostname', value);
		};
		hostnameOption.remove = function(section_id) {
			console.log('[Hostname] Remove called (prevented):', { 
				section_id: section_id,
				section: s,
				option: this
			});
			return;  // hostname은 삭제하지 않음
		};
		// 히든 필드로 렌더링하여 폼에는 포함되지만 화면에는 보이지 않음
		hostnameOption.render = function(section_id, option_id, cfgvalue) { 
			console.log('[Hostname] Render called');
			return E('input', {
				type: 'hidden',
				name: 'cbid.system.' + section_id + '.hostname',
				value: cfgvalue || 'UI-2PV'
			});
		};
		
		s.taboption('hostname_dns', form.DummyValue, '_custom_hostname_dns', '', '').renderWidget = function(section_id, option_id, cfgvalue) {
			var self = this;
			
			// IP 주소 검증 함수
			function isValidIP(ip) {
				if (!ip || ip.trim() === '') return true; // 빈 값은 허용
				var pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
				return pattern.test(ip.trim());
			}
			
			// 현재 시스템 호스트이름 읽기 (익명 섹션 접근)
			var currentHostname = uci.get('system', '@system[0]', 'hostname') || 'UI-2PV';
			console.log('[Hostname] Current value:', { 
				hostname: currentHostname,
				section_id: section_id,
				option_id: option_id,
				cfgvalue: cfgvalue,
				section: s
			});
			
			// 현재 LAN 인터페이스의 DNS 서버 읽기
			var currentDnsServers = uci.get('network', 'LAN', 'dns') || [];
			var dns1 = currentDnsServers[0] || '';
			var dns2 = currentDnsServers[1] || '';
			var dns3 = currentDnsServers[2] || '';
			
			// 호스트이름 입력 필드 생성
			var hostnameInput = E('input', { 
				'type': 'text', 
				'value': currentHostname, 
				'style': 'width:200px;',
				'id': 'hostname-input-' + section_id,
				'maxlength': '63'
			});

			// 호스트이름 변경 이벤트 핸들러
			hostnameInput.addEventListener('change', function(ev) {
				var newHostname = ev.target.value.trim();
				console.log('[Hostname] Input changed:', { 
					oldValue: currentHostname,
					newValue: newHostname,
					section_id: section_id
				});
				
				if (newHostname) {
					try {
						// UCI에 직접 설정 (익명 섹션 접근)
						console.log('[Hostname] Before UCI set:', {
							current: uci.get('system', '@system[0]', 'hostname'),
							new: newHostname
						});
						uci.set('system', '@system[0]', 'hostname', newHostname);
						console.log('[Hostname] After UCI set:', {
							value: uci.get('system', '@system[0]', 'hostname')
						});

						// 현재 값 업데이트
						currentHostname = newHostname;
						
						// 히든 필드 값도 업데이트
						var hiddenField = document.querySelector('input[name="cbid.system.' + section_id + '.hostname"]');
						if (hiddenField) {
							hiddenField.value = newHostname;
							console.log('[Hostname] Hidden field updated:', hiddenField.value);
						}
						
						console.log('[Hostname] Final state:', { 
							hostname: newHostname,
							uciValue: uci.get('system', '@system[0]', 'hostname'),
							currentHostname: currentHostname,
							hiddenFieldValue: hiddenField ? hiddenField.value : 'not found'
						});
					} catch (error) {
						console.error('[Hostname] Error during update:', error);
					}
				}
			});
			
			// DNS 입력 필드들 생성
			var dns1Input = E('input', { 
				'type': 'text', 
				'value': dns1, 
				'style': 'width:200px;',
				'id': 'dns1-input-' + section_id,
				'placeholder': '예: 164.124.101.2'
			});
			var dns2Input = E('input', { 
				'type': 'text', 
				'value': dns2, 
				'style': 'width:200px;',
				'id': 'dns2-input-' + section_id,
				'placeholder': '예: 168.126.63.1'
			});
			var dns3Input = E('input', { 
				'type': 'text', 
				'value': dns3, 
				'style': 'width:200px;',
				'id': 'dns3-input-' + section_id,
				'placeholder': '선택사항'
			});

			// DNS 변경 이벤트 핸들러 함수 
			function updateDnsServers() {
				var newDns1 = dns1Input.value.trim();
				var newDns2 = dns2Input.value.trim();
				var newDns3 = dns3Input.value.trim();
				
				// IP 주소 검증
				var valid1 = isValidIP(newDns1);
				var valid2 = isValidIP(newDns2);
				var valid3 = isValidIP(newDns3);
				
				// 시각적 피드백
				dns1Input.style.borderColor = valid1 ? '' : '#ff6b6b';
				dns2Input.style.borderColor = valid2 ? '' : '#ff6b6b';
				dns3Input.style.borderColor = valid3 ? '' : '#ff6b6b';
				
				// 모든 입력이 유효한 경우에만 UCI 업데이트
				if (valid1 && valid2 && valid3) {
					var dnsArray = [];
					if (newDns1) dnsArray.push(newDns1);
					if (newDns2) dnsArray.push(newDns2);
					if (newDns3) dnsArray.push(newDns3);
					
					if (dnsArray.length > 0) {
						uci.set('network', 'LAN', 'dns', dnsArray);
					} else {
						uci.unset('network', 'LAN', 'dns');
					}
				}
			}

			// DNS 입력 필드들에 변경 이벤트 추가
			dns1Input.addEventListener('input', updateDnsServers);
			dns2Input.addEventListener('input', updateDnsServers);
			dns3Input.addEventListener('input', updateDnsServers);
			
			return E('div', { 'style': 'padding: 16px 0 0 0; max-width: 500px; font-size:12px;' }, [
				// 게이트웨이 이름 입력
				E('div', { 'style': 'display:flex; align-items:center; margin-bottom:18px;' }, [
					E('div', { 'style': 'width:140px; font-weight:bold; margin-right:24px; text-align:right; flex-shrink:0;' }, '게이트웨이 이름'),
					hostnameInput
				]),
				// DNS 서버 입력
				E('div', { 'style': 'display:flex; align-items:center; margin-bottom:4px;' }, [
					E('div', { 'style': 'width:140px; font-weight:bold; margin-right:24px; text-align:right; flex-shrink:0;' }, '도메인 네임 서버(DNS)'),
					dns1Input
				]),
				// 두 번째 입력폼 (라벨과 정확히 같은 들여쓰기)
				E('div', { 'style': 'display:flex; align-items:center; margin-bottom:4px;' }, [
					E('div', { 'style': 'width:140px; margin-right:24px; flex-shrink:0;' }, ''),
					dns2Input
				]),
				// 세 번째 입력폼 (라벨과 정확히 같은 들여쓰기)
				E('div', { 'style': 'display:flex; align-items:center; margin-bottom:12px;' }, [
					E('div', { 'style': 'width:140px; margin-right:24px; flex-shrink:0;' }, ''),
					dns3Input
				])
			]);
		}

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
					// NTP 모드일 때만 실시간 업데이트
					var modeSelect = mapEl.querySelector('select');
					if (modeSelect && modeSelect.value === 'ntp') {
						var fields = newTimeRow.querySelectorAll('.cbi-value-field');
						if (fields.length === 2) {
							var date = new Date(t * 1000);
							var dateStr = '%04d-%02d-%02d'.format(
								date.getUTCFullYear(),
								date.getUTCMonth() + 1,
								date.getUTCDate()
							);
							var timeStr = '%02d:%02d:%02d'.format(
								date.getUTCHours(),
								date.getUTCMinutes(),
								date.getUTCSeconds()
							);
							fields[0].innerHTML = '';
							fields[0].appendChild(E('div', {}, dateStr));
							fields[1].innerHTML = '';
							fields[1].appendChild(E('div', {}, timeStr));
						}
					}
				});
			});
			return mapEl;
		});
	}
});
