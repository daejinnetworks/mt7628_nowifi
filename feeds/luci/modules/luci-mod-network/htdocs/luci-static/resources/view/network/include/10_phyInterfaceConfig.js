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
				         'background-repeat: repeat; padding: 5px 10px; border-radius: 5px; ' +
				         'opacity: 0.7;'
			}, [
				E('div', { 'style': 'margin-right: 200px; display: flex; gap: 10px;' }, [
					E('button', { 
						'class': 'btn cbi-button cbi-button-action',
						'style': 'display: flex; align-items: center; gap: 5px; border: 2px solid #007bff; border-radius: 5px;',
						'click': L.bind(this.handleChange, this)
					}, [
						E('img', { 
							'src': '/luci-static/bootstrap/change.png',
							'style': 'width: 16px; height: 16px;'
						}),
						_('Change')
					]),
					E('div', { 
						'id': 'refresh-button',
						'style': 'display: flex; align-items: center; gap: 5px; padding: 4px 12px; ' +
								 'background-color: white; color: #007bff; border: 2px solid #007bff; ' +
								 'border-radius: 5px; cursor: pointer; font-weight: normal; ' +
								 'transition: all 0.3s ease; user-select: none; font-size: 14px; ' +
								 'width: 110px; min-width: 110px; max-width: 110px; justify-content: center; box-sizing: border-box;',
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

	handleChange: function(device) {
		// Change 버튼: 선택된 인터페이스의 설정 변경
		var selected = document.querySelector('input[name="interface_select"]:checked');
		if (selected) {
			var device = selected.value;
			var self = this;
			
			// 현재 설정 로드
			var sectionName = device === 'VPN' ? 'VPN' : 'LAN';
			var currentConfig = uci.get('network', sectionName) || {};
			
			// 현재 네트워크 상태 가져오기
			var physicalDevice = device === 'VPN' ? 'eth0.1' : 'eth0.2';
			return Promise.all([
				L.resolveDefault(callNetDeviceStatus(physicalDevice), {}),
				L.resolveDefault(callSwitchPortStatus(physicalDevice), {})
			]).then(function(data) {
				var netStatus = data[0] || {};
				var switchStatus = data[1] || {};
				
				// DNS 배열 처리
				var dnsServers = [];
				if (currentConfig.dns) {
					if (Array.isArray(currentConfig.dns)) {
						dnsServers = currentConfig.dns;
					} else if (typeof currentConfig.dns === 'string') {
						dnsServers = [currentConfig.dns];
					}
				}
				
				// 현재 프로토콜 값 확인
				var currentProto = currentConfig.proto || 'static';
				
				// DHCP 모드일 때는 netStatus에서 값을 가져옴
				var currentIp = currentProto === 'dhcp' ? netStatus.ipaddr : currentConfig.ipaddr;
				var currentNetmask = currentProto === 'dhcp' ? netStatus.netmask : (currentConfig.netmask || '255.255.255.0');
				var currentGateway = currentProto === 'dhcp' ? netStatus.gateway : currentConfig.gateway;
				
				// 프로토콜 선택 옵션 정의
				var protoChoices = {
					'static': _('Static address'),
					'dhcp': _('DHCP client')
				};
				
				var netmaskChoices = [
					['255.255.255.0', '/24 (255.255.255.0)'],
					['255.255.0.0', '/16 (255.255.0.0)'],
					['255.0.0.0', '/8 (255.0.0.0)'],
					['255.255.255.128', '/25 (255.255.255.128)'],
					['255.255.255.192', '/26 (255.255.255.192)']
				];
				
				// 프로토콜 Select 위젯 생성
				var protoSelect = new ui.Select('proto', protoChoices, {
					id: 'modal-proto',
					default: currentProto,
					value: currentProto,
					style: 'width: 100%; padding: 12px; border: 2px solid #e1e8ed; border-radius: 8px; font-size: 14px; transition: border-color 0.3s ease;'
				});
				
				// Netmask Select 위젯 생성
				var netmaskSelect = new ui.Select('netmask', netmaskChoices, {
					id: 'modal-netmask',
					default: currentNetmask,
					value: currentNetmask,
					disabled: currentProto !== 'static',
					style: `width: 100%; padding: 12px; border: 2px solid #e1e8ed; border-radius: 8px; font-size: 14px; transition: border-color 0.3s ease; opacity: ${currentProto === 'static' ? '1' : '0.5'};`
				});

				// 모달 제목 설정
				var modalTitle = device === 'VPN' ? _('Configure VPN Interface') : _('Configure LAN Interface');
				
				ui.showModal(modalTitle, [
					E('div', { 
						'style': 'max-width: 600px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 15px; box-shadow: 0 20px 40px rgba(0,0,0,0.1);'
					}, [
						// 헤더
						E('div', { 'style': 'text-align: center; margin-bottom: 20px;' }, [
							E('h2', { 'style': 'color: white; margin: 0; font-size: 24px; font-weight: 300;' }, _('Configure %s Interface').format(device)),
							E('p', { 'style': 'color: rgba(255,255,255,0.8); margin: 5px 0 0 0; font-size: 14px;' }, _('Network Configuration Settings'))
						]),
						
						// 폼 컨테이너
						E('div', { 
							'style': 'background: white; border-radius: 12px; padding: 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.1);'
						}, [
							// Protocol 설정
							E('div', { 'style': 'margin-bottom: 20px;' }, [
								E('label', { 'style': 'display: block; font-weight: 600; color: #333; margin-bottom: 8px; font-size: 14px;' }, _('Protocol')),
								protoSelect.render()
							]),
							
							// IP Address 설정
							E('div', { 'style': 'margin-bottom: 20px;' }, [
								E('label', { 'style': 'display: block; font-weight: 600; color: #333; margin-bottom: 8px; font-size: 14px;' }, _('IP Address')),
								E('input', {
									'id': 'modal-ipaddr',
									'type': 'text',
									'placeholder': '192.168.1.1',
									'value': currentIp || '',
									'disabled': currentProto !== 'static',
									'style': `width: 100%; padding: 12px; border: 2px solid #e1e8ed; border-radius: 8px; font-size: 14px; transition: all 0.3s ease; opacity: ${currentProto === 'static' ? '1' : '0.5'};`,
									'onfocus': function() { 
										if (!this.disabled) {
											this.style.borderColor = '#667eea'; 
											this.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)'; 
										}
									},
									'onblur': function() { 
										if (!this.disabled) {
											this.style.borderColor = '#e1e8ed'; 
											this.style.boxShadow = 'none'; 
										}
									}
								})
							]),
							
							// Netmask 설정
							E('div', { 'style': 'margin-bottom: 20px;' }, [
								E('label', { 'style': 'display: block; font-weight: 600; color: #333; margin-bottom: 8px; font-size: 14px;' }, _('Netmask')),
								netmaskSelect.render()
							]),
							
							// Gateway 설정
							E('div', { 'style': 'margin-bottom: 20px;' }, [
								E('label', { 'style': 'display: block; font-weight: 600; color: #333; margin-bottom: 8px; font-size: 14px;' }, _('Gateway')),
								E('input', {
									'id': 'modal-gateway',
									'type': 'text',
									'placeholder': '192.168.1.1',
									'value': currentGateway || '',
									'disabled': currentProto !== 'static',
									'style': `width: 100%; padding: 12px; border: 2px solid #e1e8ed; border-radius: 8px; font-size: 14px; transition: all 0.3s ease; opacity: ${currentProto === 'static' ? '1' : '0.5'};`,
									'onfocus': function() { 
										if (!this.disabled) {
											this.style.borderColor = '#667eea'; 
											this.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)'; 
										}
									},
									'onblur': function() { 
										if (!this.disabled) {
											this.style.borderColor = '#e1e8ed'; 
											this.style.boxShadow = 'none'; 
										}
									}
								})
							]),
							
							// DNS 설정
							E('div', { 'style': 'margin-bottom: 20px;' }, [
								E('label', { 'style': 'display: block; font-weight: 600; color: #333; margin-bottom: 8px; font-size: 14px;' }, _('DNS Servers')),
								E('div', { 'style': 'margin-bottom: 10px;' }, [
									E('input', {
										'id': 'modal-dns1',
										'type': 'text',
										'placeholder': _('Primary DNS (e.g., 8.8.8.8)'),
										'value': dnsServers[0] || '',
										'style': 'width: 100%; padding: 12px; border: 2px solid #e1e8ed; border-radius: 8px; font-size: 14px; transition: all 0.3s ease;',
										'onfocus': function() { 
											this.style.borderColor = '#667eea'; 
											this.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)'; 
										},
										'onblur': function() { 
											this.style.borderColor = '#e1e8ed'; 
											this.style.boxShadow = 'none'; 
										}
									})
								]),
								E('div', { 'style': 'margin-bottom: 10px;' }, [
									E('input', {
										'id': 'modal-dns2',
										'type': 'text',
										'placeholder': _('Secondary DNS (e.g., 8.8.4.4)'),
										'value': dnsServers[1] || '',
										'style': 'width: 100%; padding: 12px; border: 2px solid #e1e8ed; border-radius: 8px; font-size: 14px; transition: all 0.3s ease;',
										'onfocus': function() { 
											this.style.borderColor = '#667eea'; 
											this.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)'; 
										},
										'onblur': function() { 
											this.style.borderColor = '#e1e8ed'; 
											this.style.boxShadow = 'none'; 
										}
									})
								])
							]),
							
							// Auto start 설정
							E('div', { 'style': 'margin-bottom: 25px;' }, [
								E('label', { 'style': 'display: flex; align-items: center; cursor: pointer; font-weight: 600; color: #333; font-size: 14px;' }, [
									E('input', {
										'id': 'modal-auto',
										'type': 'checkbox',
										'checked': currentConfig.auto !== '0',
										'style': 'margin-right: 10px; transform: scale(1.2);'
									}),
									_('Start interface on boot')
								])
							]),
							
							// 버튼 영역
							E('div', { 'style': 'display: flex; gap: 12px; justify-content: flex-end; padding-top: 20px; border-top: 1px solid #f0f0f0;' }, [
								E('button', {
									'style': 'padding: 12px 24px; border: 2px solid #6c757d; background: white; color: #6c757d; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;',
									'onmouseover': function() { this.style.background = '#6c757d'; this.style.color = 'white'; },
									'onmouseout': function() { this.style.background = 'white'; this.style.color = '#6c757d'; },
									'click': ui.hideModal
								}, _('Cancel')),
								E('button', {
									'style': 'padding: 12px 24px; border: 2px solid #667eea; background: #667eea; color: white; border-radius: 8px; cursor: pointer; font-weight: 600; transition: all 0.3s ease;',
									'onmouseover': function() { this.style.background = '#5a6fd8'; this.style.borderColor = '#5a6fd8'; },
									'onmouseout': function() { this.style.background = '#667eea'; this.style.borderColor = '#667eea'; },
									'click': function() {
										self.saveNetworkConfig(device, protoSelect, netmaskSelect);
									}
								}, _('Save Changes'))
							])
						])
					])
				]);
				
				// 프로토콜 변경 시 이벤트 리스너 설정
				protoSelect.node.addEventListener('change', function() {
					var selectedProto = protoSelect.getValue();
					var isStatic = selectedProto === 'static';
					
					// DHCP 선택 시 현재 네트워크 상태 가져오기
					if (!isStatic) {
						L.resolveDefault(callNetDeviceStatus(physicalDevice), {}).then(function(status) {
							var ipField = document.getElementById('modal-ipaddr');
							var gatewayField = document.getElementById('modal-gateway');
							var netmaskNode = netmaskSelect.node;
							
							if (ipField && status.ipaddr) {
								ipField.value = status.ipaddr;
								ipField.disabled = true;
								ipField.style.opacity = '0.5';
							}
							
							if (gatewayField && status.gateway) {
								gatewayField.value = status.gateway;
								gatewayField.disabled = true;
								gatewayField.style.opacity = '0.5';
							}
							
							if (netmaskNode && status.netmask) {
								netmaskSelect.setValue(status.netmask);
								netmaskNode.disabled = true;
								netmaskNode.style.opacity = '0.5';
							}
						});
					} else {
						// Static 모드로 변경 시 필드 활성화 및 기존 설정값 복원
						var ipField = document.getElementById('modal-ipaddr');
						var gatewayField = document.getElementById('modal-gateway');
						var netmaskNode = netmaskSelect.node;
						
						if (ipField) {
							ipField.disabled = false;
							ipField.style.opacity = '1';
							// 기존 static 설정값이 있으면 복원
							if (currentConfig.ipaddr) {
								ipField.value = currentConfig.ipaddr;
							}
						}
						
						if (gatewayField) {
							gatewayField.disabled = false;
							gatewayField.style.opacity = '1';
							// 기존 static 설정값이 있으면 복원
							if (currentConfig.gateway) {
								gatewayField.value = currentConfig.gateway;
							}
						}
						
						if (netmaskNode) {
							netmaskNode.disabled = false;
							netmaskNode.style.opacity = '1';
							// 기존 static 설정값이 있으면 복원
							if (currentConfig.netmask) {
								netmaskSelect.setValue(currentConfig.netmask);
							}
						}
					}
				});
				
			}).catch(function(err) {
				console.error('Failed to load network status:', err);
				ui.addNotification(null, E('p', _('Failed to load network status')), 'error');
			});
		} else {
			ui.addNotification(null, E('p', _('Please select an interface first')), 'warning');
		}
	},
	
	saveNetworkConfig: function(device, protoSelect, netmaskSelect) {
		var proto = protoSelect.getValue();
		var netmask = netmaskSelect.getValue();
		var ipaddr = document.getElementById('modal-ipaddr').value;
		var gateway = document.getElementById('modal-gateway').value;
		var dns1 = document.getElementById('modal-dns1').value.trim();
		var dns2 = document.getElementById('modal-dns2').value.trim();
		var auto = document.getElementById('modal-auto').checked;
		
		// UCI 설정 저장
		var sectionName = device === 'VPN' ? 'VPN' : 'LAN';
		
		console.log('Selected protocol:', proto); // 디버깅용
		
		// Protocol 설정 (static 또는 dhcp만 허용)
		if (proto !== 'static' && proto !== 'dhcp') {
			ui.addNotification(null, E('p', _('Invalid protocol selected. Only static or dhcp is allowed.')), 'error');
			return;
		}
		
		uci.set('network', sectionName, 'proto', proto);
		
		// Static IP 설정
		if (proto === 'static') {
			if (ipaddr) uci.set('network', sectionName, 'ipaddr', ipaddr);
			if (netmask) uci.set('network', sectionName, 'netmask', netmask);
			if (gateway) uci.set('network', sectionName, 'gateway', gateway);
		} else {
			// DHCP인 경우 static 관련 설정 제거
			uci.unset('network', sectionName, 'ipaddr');
			uci.unset('network', sectionName, 'netmask');
			uci.unset('network', sectionName, 'gateway');
		}
		
		// DNS 설정 (list dns 형태로 저장)
		uci.unset('network', sectionName, 'dns'); // 기존 DNS 설정 제거
		var dnsServers = [];
		if (dns1) dnsServers.push(dns1);
		if (dns2) dnsServers.push(dns2);
		
		if (dnsServers.length > 0) {
			// UCI의 list 형태로 DNS 설정
			dnsServers.forEach(function(dns) {
				uci.add_list('network', sectionName, 'dns', dns);
			});
		}
		
		// Auto start 설정
		uci.set('network', sectionName, 'auto', auto ? '1' : '0');
		
		console.log('Saving config for', sectionName, {
			proto: proto,
			ipaddr: ipaddr,
			netmask: netmask,
			gateway: gateway,
			dns: dnsServers,
			auto: auto
		});
		
		// 설정 저장 및 적용
		return uci.save()
			.then(L.bind(uci.apply, uci))
			.then(function() {
				ui.hideModal();
				ui.addNotification(null, E('p', _('Network configuration saved successfully')), 'info');
			})
			.catch(function(err) {
				ui.addNotification(null, E('p', _('Failed to save configuration: %s').format(err.message)), 'error');
			});
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
				// 활성화 상태로 변경 (진한 파란색 배경)
				refreshBtn.style.backgroundColor = '#007bff';
				refreshBtn.style.color = 'white';
				refreshBtn.style.fontWeight = 'bold';
				refreshBtn.style.border = '2px solid #007bff';
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
