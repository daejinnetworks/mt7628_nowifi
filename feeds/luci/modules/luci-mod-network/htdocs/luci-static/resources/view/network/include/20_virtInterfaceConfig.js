'use strict';
'require view';
'require uci';
'require rpc';
'require dom';
'require network';
'require ui';

var virtCallNetDeviceStatus = rpc.declare({
	object: 'luci',
	method: 'getNetDeviceStatus',
	params: [ 'device' ]
});

var virtCallSwitchPortStatus = rpc.declare({
	object: 'luci',
	method: 'getSwitchPortStatus', 
	params: [ 'device' ]
});

return view.extend({
	title: '',
	description: _('Network Interface Settings'),

	load: function() {
		return uci.load('network').then(function() {
			var interfaces = [
				{
					name: 'eth0.1',
					device: 'eth0.1',
					type: 'vlan',
					parent: 'eth0',
					vlan_id: 1,
					proto: 'static',
					auto: '1'
				},
				{
					name: 'eth0.2',
					device: 'eth0.2',
					type: 'vlan',
					parent: 'eth0',
					vlan_id: 2,
					proto: 'static',
					auto: '1'
				},
				{
					name: 'tun0',
					device: 'tun0',
					type: 'tunnel',
					parent: 'none',
					vlan_id: 0,
					proto: 'none',
					auto: '0'
				}
			];
			
			var statusPromises = [];
			for (var j = 0; j < interfaces.length; j++) {
				var device = interfaces[j].device;
				
				statusPromises.push(
					(function(dev) {
						return Promise.all([
							L.resolveDefault(virtCallNetDeviceStatus(dev), {}),
							L.resolveDefault(virtCallSwitchPortStatus(dev), {})
						]).then(function(data) {
							return {
								netStatus: data[0],
								switchStatus: data[1]
							};
						});
					})(device)
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
			E('h3', { 'style': 'margin-bottom: 10px;' }, _('Virtual Interface Configuration')),
			E('div', { 
				'style': 'display: flex; align-items: center; margin-bottom: 0px; ' +
				         'background-image: url(/luci-static/bootstrap/bg-tile.png); ' +
				         'background-repeat: repeat; padding: 5px 10px; border-radius: 5px; ' +
				         'opacity: 0.7;'
			}, [
				E('div', { 'style': 'margin-right: 200px; display: flex; gap: 10px;' }, [
					E('button', { 
						'class': 'btn cbi-button cbi-button-action',
						'style': 'display: flex; align-items: center; gap: 5px; border: 2px solid #cccccc; border-radius: 5px; background-color: #f8f9fa; color: #6c757d; cursor: not-allowed; opacity: 0.6;',
						'disabled': true
					}, [
						E('img', { 
							'src': '/luci-static/bootstrap/change.png',
							'style': 'width: 16px; height: 16px;'
						}),
						_('Change')
					]),
					E('div', { 
						'id': 'virt-refresh-button',
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
				E('span', { 'style': 'font-weight: bold; font-size: 16px; margin-left: 1px; color: black;' }, _('Virtual Interface Settings'))
			]),
			E('div', { 'class': 'table-wrapper' }, [
				E('table', { 'class': 'table cbi-section-table', 'style': 'font-size: 12px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); border-collapse: collapse; border: 1px solid #ddd;' }, [
					E('thead', {}, [
						E('tr', { 'class': 'tr table-titles', 'style': 'background-color: #4169E1; color: white;' }, [
							E('th', { 'class': 'th', 'style': 'width: 40px; text-align: center; background-color: #4169E1; color: white;' }, _('Select')),
							E('th', { 'class': 'th', 'style': 'width: 80px; background-color: #4169E1; color: white;' }, _('Device')),
							E('th', { 'class': 'th', 'style': 'width: 100px; text-align: center; background-color: #4169E1; color: white;' }, _('Type')),
							E('th', { 'class': 'th', 'style': 'width: 80px; background-color: #4169E1; color: white;' }, _('Transmit')),
							E('th', { 'class': 'th', 'style': 'width: 60px; background-color: #4169E1; color: white;' }, _('MTU')),
							E('th', { 'class': 'th', 'style': 'width: 140px; background-color: #4169E1; color: white;' }, _('MAC Address')),
							E('th', { 'class': 'th', 'style': 'width: 40px; text-align: center; background-color: #4169E1; color: white;' }, _('ID')),
							E('th', { 'class': 'th', 'style': 'width: 100px; background-color: #4169E1; color: white;' }, _('Related Device')),
							E('th', { 'class': 'th', 'style': 'width: 50px; text-align: center; background-color: #4169E1; color: white;' }, _('STP')),
							E('th', { 'class': 'th', 'style': 'width: 60px; background-color: #4169E1; color: white;' }, _('State')),
							E('th', { 'class': 'th', 'style': 'width: 60px; background-color: #4169E1; color: white;' }, _('OnBoot'))
						])
					]),
					E('tbody', { 'id': 'virt-interface-tbody' }, 
						interfaces.map((iface, index) => this.renderInterfaceRow(iface, index === 0))
					)
				])
			])
		]);

		// 폴링 추가 - 5초마다 자동 새로고침
		var self = this;
		this.virtPollTimer = setInterval(function() {
			self.updateStatus();
		}, 5000);

		return table;
	},

	renderInterfaceRow: function(iface, selected) {
		var netStatus = iface.netStatus || {};
		var switchStatus = iface.switchStatus || {};
		
		var operState = netStatus.operstate || 'DOWN';
		var stateColor = (operState === 'UP') ? '#008000' : '#ff0000';

		// Determine interface type string based on interface name
		var typeString = '';
		var transmitString = '';
		var relatedDevice = '';
		
		if (iface.name === 'eth0.1') {
			typeString = 'vlan(access)';
			transmitString = 'wan0';
			relatedDevice = 'eth0(p1)';
		} else if (iface.name === 'eth0.2') {
			typeString = 'vlan(access)';
			transmitString = 'lan0';
			relatedDevice = 'eth0(p2)';
		} else if (iface.name === 'tun0') {
			typeString = 'tunnel';
			transmitString = 'tun0';
			relatedDevice = 'virtual';
		}

		// Get MAC address from network status first, fallback to default if needed
		var macAddr = netStatus.macaddr || 'N/A';

		// Create radio input element
		var radio = E('input', {
			'type': 'radio',
			'name': 'virt_interface_select',
			'value': iface.device,
			'checked': selected ? 'checked' : null
		});

		return E('tr', { 
			'class': 'tr', 
			'data-device': iface.device,
			'style': 'cursor: pointer;',
			'click': function(ev) {
				if (ev.target.type !== 'radio') {
					radio.checked = true;
					radio.dispatchEvent(new Event('change', { bubbles: true }));
				}
			}
		}, [
			E('td', { 'class': 'td', 'style': 'text-align: center;' }, [radio]),
			E('td', { 'class': 'td' }, iface.name),
			E('td', { 'class': 'td', 'style': 'text-align: center;' }, typeString),
			E('td', { 'class': 'td' }, transmitString),
			E('td', { 'class': 'td' }, String(netStatus.mtu || 1500)),
			E('td', { 'class': 'td', 'style': 'font-family: monospace;' }, macAddr),
			E('td', { 'class': 'td', 'style': 'text-align: center;' }, '-'),
			E('td', { 'class': 'td' }, relatedDevice),
			E('td', { 'class': 'td', 'style': 'text-align: center;' }, '-'),
			E('td', { 'class': 'td' }, [
				E('span', { 'style': `color: ${stateColor}; font-weight: bold;` }, operState)
			]),
			E('td', { 'class': 'td' }, iface.auto === '1' ? 'YES' : 'NO')
		]);
	},

	updateStatus: function() {
		var self = this;
		
		return this.load().then(function(interfaces) {
			var tbody = document.getElementById('virt-interface-tbody');
			if (tbody) {
				dom.content(tbody, 
					interfaces.map((iface, index) => self.renderInterfaceRow(iface, index === 0))
				);
			}
		});
	},

	handleChange: function() {
		// Change 버튼: 선택된 가상 인터페이스의 설정 변경
		var selected = document.querySelector('input[name="virt_interface_select"]:checked');
		if (selected) {
			var device = selected.value;
			var self = this;
			
			// 현재 설정 로드 - 가상 인터페이스용
			var sectionName = device;
			var currentConfig = uci.get('network', sectionName) || {};
			
			// 현재 네트워크 상태 가져오기
			return Promise.all([
				L.resolveDefault(virtCallNetDeviceStatus(device), {}),
				L.resolveDefault(virtCallSwitchPortStatus(device), {})
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
				
				// 프로토콜 선택 옵션 정의 (가상 인터페이스용)
				var protoChoices = {};
				if (device === 'tun0') {
					protoChoices = {
						'none': _('Unmanaged'),
						'static': _('Static address')
					};
				} else {
					protoChoices = {
						'static': _('Static address'),
						'dhcp': _('DHCP client')
					};
				}
				
				var netmaskChoices = [
					['255.255.255.0', '/24 (255.255.255.0)'],
					['255.255.0.0', '/16 (255.255.0.0)'],
					['255.0.0.0', '/8 (255.0.0.0)'],
					['255.255.255.128', '/25 (255.255.255.128)'],
					['255.255.255.192', '/26 (255.255.255.192)']
				];
				
				// 프로토콜 Select 위젯 생성
				var protoSelect = new ui.Select('proto', protoChoices, {
					id: 'virt-modal-proto',
					default: currentProto,
					value: currentProto,
					style: 'width: 100%; padding: 12px; border: 2px solid #e1e8ed; border-radius: 8px; font-size: 14px; transition: border-color 0.3s ease;'
				});
				
				// Netmask Select 위젯 생성
				var netmaskSelect = new ui.Select('netmask', netmaskChoices, {
					id: 'virt-modal-netmask',
					default: currentNetmask,
					value: currentNetmask,
					disabled: currentProto !== 'static',
					style: `width: 100%; padding: 12px; border: 2px solid #e1e8ed; border-radius: 8px; font-size: 14px; transition: border-color 0.3s ease; opacity: ${currentProto === 'static' ? '1' : '0.5'};`
				});

				// 모달 제목 설정
				var modalTitle = _('Configure Virtual Interface: %s').format(device);
				
				ui.showModal(modalTitle, [
					E('div', { 
						'style': 'max-width: 600px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 15px; box-shadow: 0 20px 40px rgba(0,0,0,0.1);'
					}, [
						// 헤더
						E('div', { 'style': 'text-align: center; margin-bottom: 20px;' }, [
							E('h2', { 'style': 'color: white; margin: 0; font-size: 24px; font-weight: 300;' }, _('Configure Virtual Interface')),
							E('p', { 'style': 'color: rgba(255,255,255,0.8); margin: 5px 0 0 0; font-size: 14px;' }, _('Virtual Network Configuration for %s').format(device))
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
							
							// IP Address 설정 (tun0가 아니고 none 프로토콜이 아닐때만 표시)
							E('div', { 
								'id': 'virt-ip-config-section',
								'style': `margin-bottom: 20px; ${currentProto === 'none' ? 'display: none;' : ''}`
							}, [
								E('div', { 'style': 'margin-bottom: 20px;' }, [
									E('label', { 'style': 'display: block; font-weight: 600; color: #333; margin-bottom: 8px; font-size: 14px;' }, _('IP Address')),
									E('input', {
										'id': 'virt-modal-ipaddr',
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
										'id': 'virt-modal-gateway',
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
											'id': 'virt-modal-dns1',
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
											'id': 'virt-modal-dns2',
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
								])
							]),
							
							// Auto start 설정
							E('div', { 'style': 'margin-bottom: 25px;' }, [
								E('label', { 'style': 'display: flex; align-items: center; cursor: pointer; font-weight: 600; color: #333; font-size: 14px;' }, [
									E('input', {
										'id': 'virt-modal-auto',
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
					var isNone = selectedProto === 'none';
					
					// IP 설정 섹션 표시/숨김
					var ipConfigSection = document.getElementById('virt-ip-config-section');
					if (ipConfigSection) {
						ipConfigSection.style.display = isNone ? 'none' : 'block';
					}
					
					if (!isNone) {
						// DHCP 선택 시 현재 네트워크 상태 가져오기
						if (!isStatic) {
							L.resolveDefault(virtCallNetDeviceStatus(device), {}).then(function(status) {
								var ipField = document.getElementById('virt-modal-ipaddr');
								var gatewayField = document.getElementById('virt-modal-gateway');
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
							var ipField = document.getElementById('virt-modal-ipaddr');
							var gatewayField = document.getElementById('virt-modal-gateway');
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
		var auto = document.getElementById('virt-modal-auto').checked;
		
		// UCI 설정 저장
		var sectionName = device;
		
		console.log('Selected protocol:', proto);
		
		// Protocol 설정
		uci.set('network', sectionName, 'proto', proto);
		
		// Protocol이 none이 아닌 경우에만 IP 설정 처리
		if (proto !== 'none') {
			var netmask = netmaskSelect.getValue();
			var ipaddr = document.getElementById('virt-modal-ipaddr').value;
			var gateway = document.getElementById('virt-modal-gateway').value;
			var dns1 = document.getElementById('virt-modal-dns1').value.trim();
			var dns2 = document.getElementById('virt-modal-dns2').value.trim();
			
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
		} else {
			// none 프로토콜인 경우 모든 IP 관련 설정 제거
			uci.unset('network', sectionName, 'ipaddr');
			uci.unset('network', sectionName, 'netmask');
			uci.unset('network', sectionName, 'gateway');
			uci.unset('network', sectionName, 'dns');
		}
		
		// Auto start 설정
		uci.set('network', sectionName, 'auto', auto ? '1' : '0');
		
		console.log('Saving config for', sectionName, {
			proto: proto,
			auto: auto
		});
		
		// 설정 저장 및 적용
		return uci.save()
			.then(L.bind(uci.apply, uci))
			.then(function() {
				ui.hideModal();
				ui.addNotification(null, E('p', _('Virtual interface configuration saved successfully')), 'info');
			})
			.catch(function(err) {
				ui.addNotification(null, E('p', _('Failed to save configuration: %s').format(err.message)), 'error');
			});
	},

	handleRefresh: function() {
		var self = this;
		var refreshBtn = document.getElementById('virt-refresh-button');
		
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