'use strict';
'require view';
'require uci';
'require rpc';
'require dom';
'require network';
'require ui';

var callNetDeviceStatus = rpc.declare({
	object: 'luci',
	method: 'getNetDeviceStatus',
	params: [ 'device' ]
});

var callSwitchPortStatus = rpc.declare({
	object: 'luci',
	method: 'getSwitchPortStatus', 
	params: [ 'device' ]
});

return view.extend({
	title: _('Physical Interface Configuration'),
	description: _('Network Physical Interface Settings'),

	load: function() {
		return uci.load('network').then(function() {
			var interfaces = [];
			var sections = uci.sections('network', 'interface');
			
			for (var i = 0; i < sections.length; i++) {
				var section = sections[i];
				if (section['.name'] === 'loopback') {
					continue;
				}
				
				interfaces.push({
					name: section['.name'],
					device: section.device || section['.name'],
					proto: section.proto || 'none',
					auto: section.auto || '1'
				});
			}
			
			// LAN 먼저, VPN 나중에 정렬
			interfaces.sort(function(a, b) {
				if (a.name === 'LAN') return -1;
				if (b.name === 'LAN') return 1;
				if (a.name === 'VPN') return 1;
				if (b.name === 'VPN') return -1;
				return 0;
			});
			
			var statusPromises = [];
			for (var j = 0; j < interfaces.length; j++) {
				var physicalDevice;
				if (interfaces[j].name === 'LAN') {
					physicalDevice = 'eth0.2';
				} else if (interfaces[j].name === 'VPN') {
					physicalDevice = 'eth0.1';
				} else {
					physicalDevice = interfaces[j].device;
				}
				var interfaceName = interfaces[j].name;
				
				statusPromises.push(
					(function(device, name) {
						return Promise.all([
							L.resolveDefault(callNetDeviceStatus(device), {}),
							L.resolveDefault(callSwitchPortStatus(device), {})
						]).then(function(data) {
							return {
								netStatus: data[0],
								switchStatus: data[1]
							};
						});
					})(physicalDevice, interfaceName)
				);
			}
			
			return Promise.all(statusPromises).then(function(statusData) {
				for (var k = 0; k < interfaces.length; k++) {
					interfaces[k].netStatus = statusData[k].netStatus;
					interfaces[k].switchStatus = statusData[k].switchStatus;
				}
				return interfaces;
			});
		});
	},

	render: function(interfaces) {
		var table = E('div', { 'class': 'cbi-section' }, [
			E('h3', { 'style': 'margin-bottom: 10px;' }, _('Physical Interface Configuration')),
			E('div', { 
				'style': 'display: flex; align-items: center; margin-bottom: 0px; ' +
				         'background-image: url(/luci-static/bootstrap/bg-tile.png); ' +
				         'background-repeat: repeat; padding: 10px; border-radius: 5px; ' +
				         'opacity: 0.7;'
			}, [
				E('div', { 'style': 'margin-right: 200px; display: flex; gap: 10px;' }, [
					E('button', { 
						'class': 'btn cbi-button cbi-button-action',
						'style': 'display: flex; align-items: center; gap: 5px;',
						'click': L.bind(this.handleChange, this)
					}, [
						E('i', { 'class': 'fas fa-edit' }),
						_('Change')
					]),
					E('div', { 
						'id': 'refresh-button',
						'style': 'display: flex; align-items: center; gap: 5px; padding: 8px 16px; ' +
								 'background-color: white; color: #007bff; border: 2px solid #007bff; ' +
								 'border-radius: 5px; cursor: pointer; font-weight: normal; ' +
								 'transition: all 0.3s ease; user-select: none; font-size: 14px; ' +
								 'width: 100px; justify-content: center;',
						'click': L.bind(this.handleRefresh, this),
						'onmouseover': function() {
							if (this.getAttribute('data-active') !== 'true') {
								this.style.backgroundColor = '#f8f9fa';
							}
						},
						'onmouseout': function() {
							if (this.getAttribute('data-active') !== 'true') {
								this.style.backgroundColor = 'white';
							}
						}
					}, [
						E('span', { 'style': 'font-size: 14px;' }, '🔄'),
						E('span', {}, _('Refresh'))
					])
				]),
				E('span', { 'style': 'font-weight: bold; font-size: 16px; margin-left: 1px; color: black;' }, _('Interface Settings'))
			]),
			E('div', { 'class': 'table-wrapper' }, [
				E('table', { 'class': 'table cbi-section-table', 'style': 'font-size: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); border-collapse: collapse; border: 1px solid #ddd;' }, [
					E('thead', {}, [
						E('tr', { 'class': 'tr table-titles', 'style': 'background-color: #4169E1; color: white;' }, [
							E('th', { 'class': 'th', 'style': 'width: 40px; text-align: center; background-color: #4169E1; color: white;' }, _('Select')),
							E('th', { 'class': 'th', 'style': 'width: 60px; background-color: #4169E1; color: white;' }, _('Device')),
							E('th', { 'class': 'th', 'style': 'width: 80px; text-align: center; background-color: #4169E1; color: white;' }, _('Port')),
							E('th', { 'class': 'th', 'style': 'width: 60px; background-color: #4169E1; color: white;' }, _('MTU')),
							E('th', { 'class': 'th', 'style': 'width: 140px; background-color: #4169E1; color: white;' }, _('MAC Address')),
							E('th', { 'class': 'th', 'style': 'width: 60px; background-color: #4169E1; color: white;' }, _('State')),
							E('th', { 'class': 'th', 'style': 'width: 60px; background-color: #4169E1; color: white;' }, _('OnBoot')),
							E('th', { 'class': 'th', 'style': 'width: 60px; background-color: #4169E1; color: white;' }, _('Config')),
							E('th', { 'class': 'th', 'style': 'width: 80px; text-align: center; background-color: #4169E1; color: white;' }, _('Link')),
							E('th', { 'class': 'th', 'style': 'width: 80px; text-align: center; background-color: #4169E1; color: white;' }, _('Description'))
						])
					]),
					E('tbody', { 'id': 'interface-tbody' }, 
						interfaces.map((iface, index) => this.renderInterfaceRow(iface, index === 0))
					)
				])
			])
		]);

		// 폴링 추가 - 5초마다 자동 새로고침
		var self = this;
		this.pollTimer = setInterval(function() {
			self.updateStatus();
		}, 5000);

		return table;
	},

	renderInterfaceRow: function(iface, selected) {
		var netStatus = iface.netStatus || {};
		var switchStatus = iface.switchStatus || {};
		
		var linkStatus = switchStatus.link || 'no link';
		var operState = netStatus.operstate || 'DOWN';
		
		var linkColor = (linkStatus === 'up') ? '#008000' : '#ff0000';
		var stateColor = (operState === 'UP') ? '#008000' : '#ff0000';

		// Determine interface description based on interface name
		var description = '';
		if (iface.name === 'VPN') {
			description = 'VPN';
		} else if (iface.name === 'LAN') {
			description = 'LAN'; 
		}

		// Determine switch port alias based on interface name
		var aliasName = '';
		if (iface.name === 'VPN') {
			aliasName = 'switch0.0';
		} else if (iface.name === 'LAN') {
			aliasName = 'switch0.4';
		} else {
			aliasName = iface.device;
		}

		// Create radio input element
		var radio = E('input', {
			'type': 'radio',
			'name': 'interface_select',
			'value': iface.device,
			'checked': selected ? 'checked' : null
		});

		return E('tr', { 
			'class': 'tr', 
			'data-device': iface.device,
			'style': 'cursor: pointer;',
			'click': function(ev) {
				if (ev.target.type !== 'radio') {  // 이미 라디오 버튼을 직접 클릭한 경우는 제외
					radio.checked = true;
					// 클릭 이벤트 발생시키기
					radio.dispatchEvent(new Event('change', { bubbles: true }));
				}
			}
		}, [
			E('td', { 'class': 'td', 'style': 'text-align: center;' }, [radio]),
			E('td', { 'class': 'td' }, iface.name || iface.device),
			E('td', { 'class': 'td', 'style': 'text-align: center;' }, aliasName),
			E('td', { 'class': 'td' }, String(netStatus.mtu || 1500)),
			E('td', { 'class': 'td', 'style': 'font-family: monospace;' }, 
				netStatus.macaddr || (iface.name === 'VPN' ? '00:0c:43:47:d3:28' : 
				                     iface.name === 'LAN' ? '00:0c:43:47:d3:27' : '00:26:14:04:af:ee')),
			E('td', { 'class': 'td' }, [
				E('span', { 'style': `color: ${stateColor}; font-weight: bold;` }, operState)
			]),
			E('td', { 'class': 'td' }, iface.auto === '1' ? 'YES' : 'NO'),
			E('td', { 'class': 'td' }, iface.proto || 'auto'),
			E('td', { 'class': 'td', 'style': 'text-align: center;' }, [
				E('span', { 'style': `color: ${linkColor}; font-weight: bold;` }, linkStatus)
			]),
			E('td', { 'class': 'td', 'style': 'text-align: center;' }, description)
		]);
	},

	updateStatus: function() {
		var self = this;
		
		return this.load().then(function(interfaces) {
			var tbody = document.getElementById('interface-tbody');
			if (tbody) {
				dom.content(tbody, 
					interfaces.map((iface, index) => self.renderInterfaceRow(iface, index === 0))
				);
			}
		});
	},

	handleChange: function() {
		// Change 버튼: 선택된 인터페이스의 설정 변경
		var selected = document.querySelector('input[name="interface_select"]:checked');
		if (selected) {
			var device = selected.value;
			ui.showModal(_('Interface Configuration'), [
				E('p', _('Configure interface: %s').format(device)),
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'btn cbi-button',
						'click': ui.hideModal
					}, _('Cancel')),
					E(' '),
					E('button', {
						'class': 'btn cbi-button cbi-button-positive',
						'click': function() {
							ui.hideModal();
							ui.addNotification(null, E('p', _('Interface configuration saved')), 'info');
						}
					}, _('Save'))
				])
			]);
		} else {
			ui.addNotification(null, E('p', _('Please select an interface first')), 'warning');
		}
	},

	handleRefresh: function() {
		var self = this;
		var refreshBtn = document.getElementById('refresh-button');
		
		if (refreshBtn) {
			if (refreshBtn.getAttribute('data-active') === 'true') {
				// 비활성화 상태로 변경 (원본 상태)
				refreshBtn.style.backgroundColor = 'white';
				refreshBtn.style.color = '#007bff';
				refreshBtn.style.fontWeight = 'normal';
				refreshBtn.style.border = '2px solid #007bff';
				refreshBtn.setAttribute('data-active', 'false');
				return Promise.resolve();
			} else {
				// 활성화 상태로 변경 (skyblue 배경)
				refreshBtn.style.backgroundColor = 'skyblue';
				refreshBtn.style.color = 'white';
				refreshBtn.style.fontWeight = 'bold';
				refreshBtn.style.border = '2px solid skyblue';
				refreshBtn.setAttribute('data-active', 'true');
			}
		}
		
		return network.flushCache().then(function() {
			return self.updateStatus();
		}).catch(function(err) {
			// 에러 시에도 메시지 없이 색상으로만 피드백
			console.error('Refresh failed:', err);
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});