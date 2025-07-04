'use strict';
'require view';
'require ui';
'require rpc';
'require uci';
'require form';
'require firewall as fwmodel';
'require tools.firewall as fwtool';
'require tools.widgets as widgets';

function rule_proto_txt(s, ctHelpers) {
	var f = (uci.get('firewall', s, 'family') || '').toLowerCase().replace(/^(?:any|\*)$/, '');

	var proto = L.toArray(uci.get('firewall', s, 'proto')).filter(function(p) {
		return (p != '*' && p != 'any' && p != 'all');
	}).map(function(p) {
		var pr = fwtool.lookupProto(p);
		return {
			num:   pr[0],
			name:  pr[1],
			types: (pr[0] == 1 || pr[0] == 58) ? L.toArray(uci.get('firewall', s, 'icmp_type')) : null
		};
	});

	var m = String(uci.get('firewall', s, 'helper') || '').match(/^(!\s*)?(\S+)$/);
	var h = m ? {
		val:  m[0].toUpperCase(),
		inv:  m[1],
		name: (ctHelpers.filter(function(ctH) { return ctH.name.toLowerCase() == m[2].toLowerCase() })[0] || {}).description
	} : null;

	m = String(uci.get('firewall', s, 'mark')).match(/^(!\s*)?(0x[0-9a-f]{1,8}|[0-9]{1,10})(?:\/(0x[0-9a-f]{1,8}|[0-9]{1,10}))?$/i);
	var w = m ? {
		val:  m[0].toUpperCase().replace(/X/g, 'x'),
		inv:  m[1],
		num:  '0x%02X'.format(+m[2]),
		mask: m[3] ? '0x%02X'.format(+m[3]) : null
	} : null;

	m = String(uci.get('firewall', s, 'dscp')).match(/^(!\s*)?(?:(CS[0-7]|BE|AF[1234][123]|EF)|(0x[0-9a-f]{1,2}|[0-9]{1,2}))$/);
	var d = m ? {
		val:  m[0],
		inv:  m[1],
		name: m[2],
		num:  m[3] ? '0x%02X'.format(+m[3]) : null
	} : null;

	return fwtool.fmt(_('%{src?%{dest?Forwarded:Incoming}:Outgoing} %{ipv6?%{ipv4?<var>IPv4</var> and <var>IPv6</var>:<var>IPv6</var>}:<var>IPv4</var>}%{proto?, protocol %{proto#%{next?, }%{item.types?<var class="cbi-tooltip-container">%{item.name}<span class="cbi-tooltip">ICMP with types %{item.types#%{next?, }<var>%{item}</var>}</span></var>:<var>%{item.name}</var>}}}%{mark?, mark <var%{mark.inv? data-tooltip="Match fwmarks except %{mark.num}%{mark.mask? with mask %{mark.mask}}.":"%{mark.mask? data-tooltip="Mask fwmark value with %{mark.mask} before compare."}}>%{mark.val}</var>}%{dscp?, DSCP %{dscp.inv?<var data-tooltip="Match DSCP classifications except %{dscp.num?:%{dscp.name}}">%{dscp.val}</var>:<var>%{dscp.val}</var>}}%{helper?, helper %{helper.inv?<var data-tooltip="Match any helper except &quot;%{helper.name}&quot;">%{helper.val}</var>:<var data-tooltip="%{helper.name}">%{helper.val}</var>}}'), {
		ipv4: (!f || f == 'ipv4'),
		ipv6: (!f || f == 'ipv6'),
		src:  uci.get('firewall', s, 'src'),
		dest: uci.get('firewall', s, 'dest'),
		proto: proto,
		helper: h,
		mark:   w,
		dscp:   d
	});
}

function rule_src_txt(s, hosts) {
	var z = uci.get('firewall', s, 'src'),
	    d = (uci.get('firewall', s, 'direction') == 'in') ? uci.get('firewall', s, 'device') : null;

	return fwtool.fmt(_('From %{src}%{src_device?, interface <var>%{src_device}</var>}%{src_ip?, IP %{src_ip#%{next?, }<var%{item.inv? data-tooltip="Match IP addresses except %{item.val}."}}>%{item.ival}</var>}}%{src_port?, port %{src_port#%{next?, }<var%{item.inv? data-tooltip="Match ports except %{item.val}."}}>%{item.ival}</var>}}%{src_mac?, MAC %{src_mac#%{next?, }<var%{item.inv? data-tooltip="Match MACs except %{item.val}%{item.hint.name? a.k.a. %{item.hint.name}}.":"%{item.hint.name? data-tooltip="%{item.hint.name}"}}>%{item.ival}</var>}}'), {
		src: E('span', { 'class': 'zonebadge', 'style': fwmodel.getZoneColorStyle(z) }, [(z == '*') ? E('em', _('any zone')) : (z ? E('strong', z) : E('em', _('this device')))]),
		src_ip: fwtool.map_invert(uci.get('firewall', s, 'src_ip'), 'toLowerCase'),
		src_mac: fwtool.map_invert(uci.get('firewall', s, 'src_mac'), 'toUpperCase').map(function(v) { return Object.assign(v, { hint: hosts[v.val] }) }),
		src_port: fwtool.map_invert(uci.get('firewall', s, 'src_port')),
		src_device: d
	});
}

function rule_dest_txt(s) {
	var z = uci.get('firewall', s, 'dest'),
	    d = (uci.get('firewall', s, 'direction') == 'out') ? uci.get('firewall', s, 'device') : null;

	return fwtool.fmt(_('To %{dest}%{dest_device?, interface <var>%{dest_device}</var>}%{dest_ip?, IP %{dest_ip#%{next?, }<var%{item.inv? data-tooltip="Match IP addresses except %{item.val}."}}>%{item.ival}</var>}}%{dest_port?, port %{dest_port#%{next?, }<var%{item.inv? data-tooltip="Match ports except %{item.val}."}}>%{item.ival}</var>}}'), {
		dest: E('span', { 'class': 'zonebadge', 'style': fwmodel.getZoneColorStyle(z) }, [(z == '*') ? E('em', _('any zone')) : (z ? E('strong', z) : E('em', _('this device')))]),
		dest_ip: fwtool.map_invert(uci.get('firewall', s, 'dest_ip'), 'toLowerCase'),
		dest_port: fwtool.map_invert(uci.get('firewall', s, 'dest_port')),
		dest_device: d
	});
}

function rule_limit_txt(s) {
	var m = String(uci.get('firewall', s, 'limit')).match(/^(\d+)\/([smhd])\w*$/i),
	    l = m ? {
		    num:   +m[1],
		    unit:  ({ s: _('second'), m: _('minute'), h: _('hour'), d: _('day') })[m[2]],
		    burst: uci.get('firewall', s, 'limit_burst')
	    } : null;

	if (!l)
		return '';

	return fwtool.fmt(_('Limit matching to <var>%{limit.num}</var> packets per <var>%{limit.unit}</var>%{limit.burst? burst <var>%{limit.burst}</var>}'), { limit: l });
}

function rule_target_txt(s, ctHelpers) {
	var t = uci.get('firewall', s, 'target'),
	    h = (uci.get('firewall', s, 'set_helper') || '').toUpperCase(),
	    s = {
	    	target: t,
	    	src:    uci.get('firewall', s, 'src'),
	    	dest:   uci.get('firewall', s, 'dest'),
	    	set_helper: h,
	    	set_mark:   uci.get('firewall', s, 'set_mark'),
	    	set_xmark:  uci.get('firewall', s, 'set_xmark'),
	    	set_dscp:   uci.get('firewall', s, 'set_dscp'),
	    	helper_name: (ctHelpers.filter(function(ctH) { return ctH.name.toUpperCase() == h })[0] || {}).description
	    };

	switch (t) {
	case 'DROP':
		return fwtool.fmt(_('<var data-tooltip="DROP">Drop</var> %{src?%{dest?forward:input}:output}'), s);

	case 'ACCEPT':
		return fwtool.fmt(_('<var data-tooltip="ACCEPT">Accept</var> %{src?%{dest?forward:input}:output}'), s);

	case 'REJECT':
		return fwtool.fmt(_('<var data-tooltip="REJECT">Reject</var> %{src?%{dest?forward:input}:output}'), s);

	case 'NOTRACK':
		return fwtool.fmt(_('<var data-tooltip="NOTRACK">Do not track</var> %{src?%{dest?forward:input}:output}'), s);

	case 'HELPER':
		return fwtool.fmt(_('<var data-tooltip="HELPER">Assign conntrack</var> helper <var%{helper_name? data-tooltip="%{helper_name}"}}>%{set_helper}</var>'), s);

	case 'MARK':
		return fwtool.fmt(_('<var data-tooltip="MARK">%{set_mark?Assign:XOR}</var> firewall mark <var>%{set_mark?:%{set_xmark}}</var>'), s);

	case 'DSCP':
		return fwtool.fmt(_('<var data-tooltip="DSCP">Assign DSCP</var> classification <var>%{set_dscp}</var>'), s);

	default:
		return t;
	}
}

return view.extend({
	callHostHints: rpc.declare({
		object: 'luci-rpc',
		method: 'getHostHints',
		expect: { '': {} }
	}),

	callConntrackHelpers: rpc.declare({
		object: 'luci',
		method: 'getConntrackHelpers',
		expect: { result: [] }
	}),

	// IP 주소를 타입별로 분류하는 함수
	categorizeIPAddresses: function(hosts) {
		var ipCategories = {
			network: [],      // 네트워크 대역 (CIDR 포함)
			interface: [],    // 인터페이스 IP
			host: [],        // 호스트 IP (UI-PV-VPN 등)
			vpn: [],         // VPN 관련 IP
			custom: []       // 사용자 정의
		};

		// 호스트 힌트에서 IP 정보 추출 및 분류
		Object.keys(hosts).forEach(function(key) {
			var host = hosts[key];
			if (host.ipv4) {
				var ip = host.ipv4;
				var name = host.name || '';
				
				// VPN 관련 IP 판별 (UI-PV-VPN 등)
				if (name.includes('VPN') || name.includes('UI-PV')) {
					ipCategories.vpn.push({
						ip: ip,
						name: name,
						display: ip + ' (' + name + ')'
					});
				}
				// 네트워크 대역 판별 (CIDR 포함)
				else if (ip.includes('/')) {
					ipCategories.network.push({
						ip: ip,
						name: name,
						display: ip + (name ? ' (' + name + ')' : '')
					});
				}
				// 인터페이스 IP 판별
				else if (name.includes('interface') || name === 'lan' || name === 'wan') {
					ipCategories.interface.push({
						ip: ip,
						name: name,
						display: ip + ' (' + name + ')'
					});
				}
				// 일반 호스트 IP
				else {
					ipCategories.host.push({
						ip: ip,
						name: name,
						display: ip + (name ? ' (' + name + ')' : '')
					});
				}
			}
		});

		return ipCategories;
	},

	// IP 타입 드롭다운 옵션 생성
	createIPTypeOptions: function(ipCategories) {
		var options = [
			{ value: 'direct', label: _('직접입력(네트워크)') }
		];

		if (ipCategories.network.length > 0) {
			options.push({ value: 'network', label: _('네트워크 대역') });
		}
		if (ipCategories.interface.length > 0) {
			options.push({ value: 'interface', label: _('인터페이스 IP') });
		}
		if (ipCategories.host.length > 0) {
			options.push({ value: 'host', label: _('호스트 IP') });
		}
		if (ipCategories.vpn.length > 0) {
			options.push({ value: 'vpn', label: _('VPN IP') });
		}

		return options;
	},

	// IP 주소 드롭다운 옵션 생성
	createIPAddressOptions: function(ipCategories, selectedType) {
		var options = [
			{ value: '', label: _('-- IP 주소 선택 --') }
		];

		var selectedCategory = ipCategories[selectedType] || [];
		selectedCategory.forEach(function(item) {
			options.push({
				value: item.ip,
				label: item.display
			});
		});

		return options;
	},

	// IP 주소 드롭다운을 동적으로 업데이트
	updateIPAddressDropdown: function(selectedType, target) {
		var dropdown = document.getElementById(target + '-ip-dropdown');
		var ipInputsContainer = dropdown.parentNode.nextElementSibling;
		
		if (selectedType === 'direct') {
			// 직접입력 모드: 드롭다운 숨기고 IP 입력 필드 보이기
			dropdown.style.display = 'none';
			if (ipInputsContainer) ipInputsContainer.style.display = 'flex';
		} else {
			// 선택 모드: 드롭다운 보이고 IP 입력 필드 숨기기
			dropdown.style.display = 'block';
			if (ipInputsContainer) ipInputsContainer.style.display = 'none';
			
			// 드롭다운 옵션 업데이트
			if (this.currentIPCategories) {
				var options = this.createIPAddressOptions(this.currentIPCategories, selectedType);
				dropdown.innerHTML = '';
				options.forEach(function(option) {
					var optionElement = E('option', { 'value': option.value }, option.label);
					dropdown.appendChild(optionElement);
				});
			}
		}
	},

	// 선택된 IP를 입력 필드에 채우기
	populateIPFields: function(selectedIP, target) {
		if (!selectedIP) return;
		
		var parts = selectedIP.split('.');
		if (parts.length === 4) {
			var ipInputs = document.querySelectorAll('input[data-uci="' + target + '_ip"]');
			ipInputs.forEach(function(input, index) {
				if (parts[index]) {
					input.value = parts[index];
				}
			});
		}
	},

	// IP 카테고리를 UI에 적용
	// 인터페이스/존 정보에서 입력인터페이스 옵션 생성
	createInterfaceOptions: function() {
		var options = [
			{ value: '', label: _('Input (this device)') },
			{ value: '*', label: _('Any zone') }
		];

		// UCI에서 방화벽 존 정보 가져오기
		var zones = uci.sections('firewall', 'zone');
		zones.forEach(function(zone) {
			if (zone.name && zone.name !== 'loopback') {
				options.push({
					value: zone.name,
					label: zone.name.toUpperCase()
				});
			}
		});

		// 네트워크 인터페이스 정보 추가 (hosts에서)
		if (this.currentNetworkInterfaces) {
			this.currentNetworkInterfaces.forEach(function(iface) {
				// 중복 방지
				var exists = options.some(function(opt) {
					return opt.value === iface.name;
				});
				if (!exists) {
					options.push({
						value: iface.name,
						label: iface.display
					});
				}
			});
		}

		return options;
	},

	// 네트워크 인터페이스 정보 수집
	collectNetworkInterfaces: function(hosts) {
		var interfaces = [];
		
		// 호스트 정보에서 인터페이스 추출
		Object.keys(hosts).forEach(function(key) {
			var host = hosts[key];
			if (host.name && (host.name === 'lan' || host.name === 'wan' || 
			    host.name.includes('interface') || host.name.includes('vpn'))) {
				interfaces.push({
					name: host.name,
					ip: host.ipv4 || host.ipv6,
					display: host.name.toUpperCase() + (host.ipv4 ? ' (' + host.ipv4 + ')' : '')
				});
			}
		});

		// UCI에서 네트워크 인터페이스 정보 추가
		var networkSections = uci.sections('network', 'interface');
		networkSections.forEach(function(section) {
			if (section['.name'] && section['.name'] !== 'loopback') {
				var exists = interfaces.some(function(iface) {
					return iface.name === section['.name'];
				});
				if (!exists) {
					interfaces.push({
						name: section['.name'],
						ip: section.ipaddr || '',
						display: section['.name'].toUpperCase()
					});
				}
			}
		});

		return interfaces;
	},

	// 입력인터페이스 드롭다운 업데이트
	updateInterfaceDropdown: function() {
		var interfaceSelect = document.querySelector('select[data-uci="src"]');
		if (interfaceSelect) {
			var options = this.createInterfaceOptions();
			interfaceSelect.innerHTML = '';
			options.forEach(function(option) {
				var optionElement = E('option', { 'value': option.value }, option.label);
				interfaceSelect.appendChild(optionElement);
			});
		}
	},

	// Stateful Inspection 옵션 토글 함수
	toggleStatefulOptions: function() {
		var statefulCheckbox = document.getElementById('stateful-main');
		var statefulOptions = document.getElementById('stateful-options');
		
		if (statefulCheckbox && statefulOptions) {
			if (statefulCheckbox.checked) {
				statefulOptions.style.display = 'flex';
				console.log('Stateful options shown');
			} else {
				statefulOptions.style.display = 'none';
				// 메인 체크박스가 해제되면 모든 세부 옵션도 해제
				var detailCheckboxes = statefulOptions.querySelectorAll('input[type="checkbox"]');
				detailCheckboxes.forEach(function(checkbox) {
					checkbox.checked = false;
				});
				console.log('Stateful options hidden and cleared');
			}
		}
	},

	applyIPCategoriesToUI: function(ipCategories) {
		this.currentIPCategories = ipCategories;
		
		// 출발지 IP 타입 드롭다운 업데이트
		var srcTypeSelect = document.getElementById('src-ip-type');
		if (srcTypeSelect) {
			var typeOptions = this.createIPTypeOptions(ipCategories);
			srcTypeSelect.innerHTML = '';
			typeOptions.forEach(function(option) {
				var optionElement = E('option', { 'value': option.value }, option.label);
				srcTypeSelect.appendChild(optionElement);
			});
		}

		// 목적지 IP 타입 드롭다운 업데이트  
		var destTypeSelect = document.getElementById('dest-ip-type');
		if (destTypeSelect) {
			var typeOptions = this.createIPTypeOptions(ipCategories);
			destTypeSelect.innerHTML = '';
			typeOptions.forEach(function(option) {
				var optionElement = E('option', { 'value': option.value }, option.label);
				destTypeSelect.appendChild(optionElement);
			});
		}
	},

	// UCI 설정과 Rule Config UI 연결을 위한 헬퍼 함수들
	initRuleConfigBindings: function() {
		var self = this;
		
		// 현재 편집 중인 rule section ID
		this.currentRuleSection = null;
		
		// Form Map에 변경사항을 직접 등록하는 함수
		this.registerFormChanges = function(formMap) {
			console.log('registerFormChanges called with formMap:', formMap);
			
			if (!formMap || !self.currentRuleSection) {
				console.log('No formMap or currentRuleSection available');
				return;
			}
			
			try {
				// Form Map의 변경사항 추적 시스템에 직접 등록
				if (formMap.data && typeof formMap.data === 'object') {
					// UCI 변경사항을 Form 데이터에 반영
					if (!formMap.data[self.currentRuleSection]) {
						formMap.data[self.currentRuleSection] = {};
					}
					
					// 현재 Rule Config의 값들을 Form 데이터에 복사
					var container = document.getElementById('rule-config');
					if (container) {
						// enabled 값 복사
						var enabledCheckbox = container.querySelector('input[data-uci="enabled"]');
						if (enabledCheckbox) {
							formMap.data[self.currentRuleSection].enabled = enabledCheckbox.checked ? '1' : '0';
						}
						
						// target 값 복사  
						var targetSelect = container.querySelector('select[data-uci="target"]');
						if (targetSelect) {
							formMap.data[self.currentRuleSection].target = targetSelect.value;
						}
						
						// proto 값 복사
						var protoSelect = container.querySelector('select[data-uci="proto"]');
						if (protoSelect) {
							formMap.data[self.currentRuleSection].proto = protoSelect.value;
						}
						
						// src 값 복사
						var srcSelect = container.querySelector('select[data-uci="src"]');
						if (srcSelect) {
							formMap.data[self.currentRuleSection].src = srcSelect.value;
						}
						
						// priority 값 복사
						var priorityInput = container.querySelector('input[data-uci="priority"]');
						if (priorityInput) {
							formMap.data[self.currentRuleSection].priority = priorityInput.value;
						}
						
						// comment 값 복사
						var commentInput = container.querySelector('input[data-uci="comment"]');
						if (commentInput) {
							formMap.data[self.currentRuleSection].comment = commentInput.value;
						}
						
						// Stateful Inspection 값들 복사
						var statefulEnabled = container.querySelector('input[data-uci="stateful_enabled"]');
						if (statefulEnabled) {
							formMap.data[self.currentRuleSection].stateful_enabled = statefulEnabled.checked;
						}
						
						var statefulNew = container.querySelector('input[data-uci="stateful_new"]');
						if (statefulNew) {
							formMap.data[self.currentRuleSection].stateful_new = statefulNew.checked;
						}
						
						var statefulEstablished = container.querySelector('input[data-uci="stateful_established"]');
						if (statefulEstablished) {
							formMap.data[self.currentRuleSection].stateful_established = statefulEstablished.checked;
						}
						
						var statefulRelated = container.querySelector('input[data-uci="stateful_related"]');
						if (statefulRelated) {
							formMap.data[self.currentRuleSection].stateful_related = statefulRelated.checked;
						}
						
						var statefulInvalid = container.querySelector('input[data-uci="stateful_invalid"]');
						if (statefulInvalid) {
							formMap.data[self.currentRuleSection].stateful_invalid = statefulInvalid.checked;
						}
						
						// IP 주소 값들을 즉시 처리하여 Form에 반영
						self.saveIPAddress('src');
						self.saveIPAddress('dest');
						
						// 모든 설정을 즉시 UCI에도 저장
						if (enabledCheckbox) {
							uci.set('firewall', self.currentRuleSection, 'enabled', enabledCheckbox.checked ? '1' : '0');
						}
						if (targetSelect && targetSelect.value) {
							uci.set('firewall', self.currentRuleSection, 'target', targetSelect.value);
						}
						if (protoSelect && protoSelect.value) {
							uci.set('firewall', self.currentRuleSection, 'proto', protoSelect.value);
						}
						if (srcSelect && srcSelect.value !== '') {
							uci.set('firewall', self.currentRuleSection, 'src', srcSelect.value);
						}
						if (priorityInput && priorityInput.value.trim()) {
							uci.set('firewall', self.currentRuleSection, 'name', priorityInput.value.trim());
						}
						if (commentInput && commentInput.value.trim()) {
							uci.set('firewall', self.currentRuleSection, 'comment', commentInput.value.trim());
						}
						
						// Stateful Inspection UCI 저장
						if (statefulEnabled) {
							if (statefulEnabled.checked) {
								uci.set('firewall', self.currentRuleSection, 'extra', '-m conntrack');
								
								// 선택된 상태들을 배열로 수집
								var states = [];
								if (statefulNew && statefulNew.checked) states.push('NEW');
								if (statefulEstablished && statefulEstablished.checked) states.push('ESTABLISHED');
								if (statefulRelated && statefulRelated.checked) states.push('RELATED');
								if (statefulInvalid && statefulInvalid.checked) states.push('INVALID');
								
								if (states.length > 0) {
									uci.set('firewall', self.currentRuleSection, 'extra', '-m conntrack --ctstate ' + states.join(','));
								}
							} else {
								uci.unset('firewall', self.currentRuleSection, 'extra');
							}
						}
						
						// 처리된 IP 주소를 Form 데이터에도 복사
						var srcIP = uci.get('firewall', self.currentRuleSection, 'src_ip');
						if (srcIP) {
							formMap.data[self.currentRuleSection].src_ip = srcIP;
						}
						
						var destIP = uci.get('firewall', self.currentRuleSection, 'dest_ip');
						if (destIP) {
							formMap.data[self.currentRuleSection].dest_ip = destIP;
						}
					}
					
					console.log('Form data updated:', formMap.data[self.currentRuleSection]);
				}
				
				// Form Map의 변경 플래그 설정
				if (typeof formMap.checkDepends === 'function') {
					formMap.checkDepends();
				}
				
				// UI 변경 지시자 설정
				if (typeof ui !== 'undefined' && ui.changes) {
					ui.changes.setIndicator(true);
				}
				
				console.log('Form changes registered successfully');
			} catch (err) {
				console.error('Error registering form changes:', err);
			}
		};
		
		// Rule Config 폼 데이터를 UCI에 저장
		this.saveRuleConfig = function() {
			console.log('saveRuleConfig called');
			
			if (!self.currentRuleSection) {
				// 새 rule section 생성
				self.currentRuleSection = uci.add('firewall', 'rule');
				console.log('Created new rule section:', self.currentRuleSection);
				// 새 섹션 생성 시 즉시 변경사항 감지
				self.forceChangeDetection();
			}
			
			var container = document.getElementById('rule-config');
			if (!container) {
				console.log('Rule config container not found');
				return Promise.resolve();
			}
			
			// 우선순위 매핑 (option name으로 저장) - 맨 먼저 설정하여 제일 위에 나타나도록
			var priorityInput = container.querySelector('input[data-uci="priority"]');
			if (priorityInput && priorityInput.value.trim()) {
				var nameValue = priorityInput.value.trim();
				uci.set('firewall', self.currentRuleSection, 'name', nameValue);
				console.log('Set name (from priority):', nameValue);
			} else {
				console.log('Priority input not found or empty');
			}
			
			// 사용여부 매핑 (option enabled)
			var enabledCheckbox = container.querySelector('input[data-uci="enabled"]');
			if (enabledCheckbox) {
				var enabledValue = enabledCheckbox.checked ? '1' : '0';
				uci.set('firewall', self.currentRuleSection, 'enabled', enabledValue);
				console.log('Set enabled:', enabledValue);
			} else {
				console.log('Enabled checkbox not found');
			}
			
			// 행위 매핑 (option target) - 원본과 동일한 처리
			var targetSelect = container.querySelector('select[data-uci="target"]');
			if (targetSelect && targetSelect.value) {
				var targetValue = targetSelect.value;
				console.log('Target select found, value:', targetValue);
				// MARK_SET, MARK_XOR는 MARK로 변환 (원본 로직과 동일)
				if (targetValue === 'MARK_SET' || targetValue === 'MARK_XOR') {
					uci.set('firewall', self.currentRuleSection, 'target', 'MARK');
					if (targetValue === 'MARK_SET') {
						uci.set('firewall', self.currentRuleSection, 'set_mark', '1');
					}
					console.log('Set target to MARK with set_mark');
				} else {
					uci.set('firewall', self.currentRuleSection, 'target', targetValue);
					console.log('Set target:', targetValue);
				}
			} else {
				console.log('Target select not found or empty');
			}
			
			// 프로토콜 매핑 (option proto)
			var protoSelect = container.querySelector('select[data-uci="proto"]');
			if (protoSelect && protoSelect.value) {
				var protoValue = protoSelect.value;
				// 'all'을 적절한 형태로 변환
				if (protoValue === 'all') {
					protoValue = 'tcp udp';
				}
				uci.set('firewall', self.currentRuleSection, 'proto', protoValue);
				console.log('Set proto:', protoValue);
			} else {
				console.log('Proto select not found or empty');
			}
			
			// 입력인터페이스 매핑 (option src)
			var srcSelect = container.querySelector('select[data-uci="src"]');
			if (srcSelect && srcSelect.value !== '') {
				uci.set('firewall', self.currentRuleSection, 'src', srcSelect.value);
				console.log('Set src:', srcSelect.value);
			} else {
				console.log('Src select not found or empty');
			}
			
			// 주석 매핑 (option comment)
			var commentInput = container.querySelector('input[data-uci="comment"]');
			if (commentInput && commentInput.value.trim()) {
				uci.set('firewall', self.currentRuleSection, 'comment', commentInput.value.trim());
				console.log('Set comment:', commentInput.value.trim());
			} else {
				console.log('Comment input not found or empty');
			}
			
			// Stateful Inspection 매핑 (option extra)
			var statefulEnabled = container.querySelector('input[data-uci="stateful_enabled"]');
			if (statefulEnabled && statefulEnabled.checked) {
				// 선택된 상태들을 배열로 수집
				var states = [];
				var statefulNew = container.querySelector('input[data-uci="stateful_new"]');
				var statefulEstablished = container.querySelector('input[data-uci="stateful_established"]');
				var statefulRelated = container.querySelector('input[data-uci="stateful_related"]');
				var statefulInvalid = container.querySelector('input[data-uci="stateful_invalid"]');
				
				if (statefulNew && statefulNew.checked) states.push('NEW');
				if (statefulEstablished && statefulEstablished.checked) states.push('ESTABLISHED');
				if (statefulRelated && statefulRelated.checked) states.push('RELATED');
				if (statefulInvalid && statefulInvalid.checked) states.push('INVALID');
				
				if (states.length > 0) {
					var extraValue = '-m conntrack --ctstate ' + states.join(',');
					uci.set('firewall', self.currentRuleSection, 'extra', extraValue);
					console.log('Set stateful inspection:', extraValue);
				} else {
					uci.set('firewall', self.currentRuleSection, 'extra', '-m conntrack');
					console.log('Set basic conntrack without states');
				}
			} else {
				uci.unset('firewall', self.currentRuleSection, 'extra');
				console.log('Stateful inspection disabled, removed extra option');
			}
			
			// IP 주소 조합 및 저장 (option src_ip, dest_ip)
			self.saveIPAddress('src');
			self.saveIPAddress('dest');
			
			// Time Restrictions 저장 (기존 timed 탭 로직 복사)
			self.saveTimeRestrictions();
			
			// 저장하기 전에 유효한 데이터가 있는지 확인 (완화된 조건)
			var hasValidData = true; // 기본적으로 저장하도록 변경
			var container = document.getElementById('rule-config');
			if (container) {
				var enabledCheckbox = container.querySelector('input[data-uci="enabled"]');
				var targetSelect = container.querySelector('select[data-uci="target"]');
				var protoSelect = container.querySelector('select[data-uci="proto"]');
				var priorityInput = container.querySelector('input[data-uci="priority"]');
				var ipInputs = container.querySelectorAll('input[data-uci="src_ip"], input[data-uci="dest_ip"]');
				
				// 최소한 하나의 의미있는 값이 있으면 저장
				hasValidData = (enabledCheckbox && enabledCheckbox.checked) ||
					(targetSelect && targetSelect.value) ||
					(protoSelect && protoSelect.value) ||
					(priorityInput && priorityInput.value.trim()) ||
					Array.from(ipInputs).some(input => input.value.trim() !== '');
					
				console.log('Validation check - hasValidData:', hasValidData);
				console.log('- enabled:', enabledCheckbox ? enabledCheckbox.checked : 'not found');
				console.log('- target:', targetSelect ? targetSelect.value : 'not found');
				console.log('- proto:', protoSelect ? protoSelect.value : 'not found');
				console.log('- priority:', priorityInput ? priorityInput.value : 'not found');
			}
			
			if (!hasValidData) {
				console.log('No valid data to save, skipping');
				return Promise.resolve();
			}
			
			// Rule 이름이 설정되지 않은 경우에만 기본값 설정
			var currentName = uci.get('firewall', self.currentRuleSection, 'name');
			if (!currentName) {
				uci.set('firewall', self.currentRuleSection, 'name', 'Rule ' + Date.now());
				console.log('Set default name for rule');
			}
			
			console.log('Saving UCI changes...');
			return uci.save().then(function() {
				console.log('UCI save completed');
				// 옵션 순서 조정 (name을 맨 앞에)
				return self.reorderRuleOptions();
			}).then(function() {
				// PBR include를 파일 맨 아래로 이동
				return self.movePBRIncludeToBottom();
			}).catch(function(err) {
				console.error('UCI save failed:', err);
				return Promise.reject(err);
			});
		};
		
		// Time Restrictions 저장 함수 (기존 timed 탭 로직 복사)
		this.saveTimeRestrictions = function() {
			var container = document.getElementById('rule-config');
			if (!container || !self.currentRuleSection) return;

			// Week Days 저장 (기존 로직 복사)
			var weekdayCheckboxes = container.querySelectorAll('input[data-uci="weekdays"]:checked');
			var weekdays = Array.from(weekdayCheckboxes).map(cb => cb.value);
			if (weekdays.length > 0) {
				uci.set('firewall', self.currentRuleSection, 'weekdays', weekdays.join(' '));
				console.log('Set weekdays:', weekdays.join(' '));
			} else {
				uci.unset('firewall', self.currentRuleSection, 'weekdays');
			}

			// Month Days 저장 (기존 로직 복사)
			var monthdayCheckboxes = container.querySelectorAll('input[data-uci="monthdays"]:checked');
			var monthdays = Array.from(monthdayCheckboxes).map(cb => cb.value);
			if (monthdays.length > 0) {
				uci.set('firewall', self.currentRuleSection, 'monthdays', monthdays.join(' '));
				console.log('Set monthdays:', monthdays.join(' '));
			} else {
				uci.unset('firewall', self.currentRuleSection, 'monthdays');
			}

			// Start/Stop Time 저장
			var startTimeInput = container.querySelector('input[data-uci="start_time"]');
			var stopTimeInput = container.querySelector('input[data-uci="stop_time"]');
			if (startTimeInput && startTimeInput.value) {
				uci.set('firewall', self.currentRuleSection, 'start_time', startTimeInput.value);
				console.log('Set start_time:', startTimeInput.value);
			} else {
				uci.unset('firewall', self.currentRuleSection, 'start_time');
			}
			if (stopTimeInput && stopTimeInput.value) {
				uci.set('firewall', self.currentRuleSection, 'stop_time', stopTimeInput.value);
				console.log('Set stop_time:', stopTimeInput.value);
			} else {
				uci.unset('firewall', self.currentRuleSection, 'stop_time');
			}

			// Start/Stop Date 저장
			var startDateInput = container.querySelector('input[data-uci="start_date"]');
			var stopDateInput = container.querySelector('input[data-uci="stop_date"]');
			if (startDateInput && startDateInput.value) {
				uci.set('firewall', self.currentRuleSection, 'start_date', startDateInput.value);
				console.log('Set start_date:', startDateInput.value);
			} else {
				uci.unset('firewall', self.currentRuleSection, 'start_date');
			}
			if (stopDateInput && stopDateInput.value) {
				uci.set('firewall', self.currentRuleSection, 'stop_date', stopDateInput.value);
				console.log('Set stop_date:', stopDateInput.value);
			} else {
				uci.unset('firewall', self.currentRuleSection, 'stop_date');
			}
		};
		
		// IP 주소 4개 필드를 조합하여 점 형태로 저장 (수정된 방식)
		this.saveIPAddress = function(type) {
			var container = document.getElementById('rule-config');
			var ipInputs = container.querySelectorAll(`input[data-uci="${type}_ip"]`);
			var maskInputs = container.querySelectorAll(`input[data-uci="${type}_mask"]`);
			
			console.log(`saveIPAddress for ${type}: found ${ipInputs.length} IP inputs, ${maskInputs.length} mask inputs`);
			
			if (ipInputs.length === 4) {
				// IP 주소 조합
				var ipParts = Array.from(ipInputs).map(input => {
					var value = input.value.trim();
					return value === '' ? '0' : value;
				});
				var ip = ipParts.join('.');
				
				console.log(`${type} IP parts:`, ipParts, 'Combined IP:', ip);
				
				// 유효한 IP인지 확인 (모두 0이 아닌 경우)
				var isValidIP = ipParts.some(part => part !== '0') && 
					ipParts.every(part => {
						var num = parseInt(part);
						return !isNaN(num) && num >= 0 && num <= 255;
					});
				
				if (isValidIP) {
					// 방화벽 설정에서는 src_ip, dest_ip를 배열로 저장
					console.log(`Setting ${type}_ip to:`, ip);
					uci.unset('firewall', self.currentRuleSection, type + '_ip');  // 기존 값 제거
					uci.set('firewall', self.currentRuleSection, type + '_ip', [ip]);  // 배열로 설정
				} else {
					console.log(`Invalid or empty IP for ${type}, not saving`);
				}
				
				// 넷마스크 처리 (있는 경우)
				if (maskInputs.length === 4) {
					var maskParts = Array.from(maskInputs).map(input => {
						var value = input.value.trim();
						return value === '' ? '0' : value;
					});
					var mask = maskParts.join('.');
					
					// 유효한 넷마스크인지 확인 (모두 0이 아닌 경우)
					var isValidMask = maskParts.some(part => part !== '0') && 
						maskParts.every(part => {
							var num = parseInt(part);
							return !isNaN(num) && num >= 0 && num <= 255;
						});
					
					if (isValidMask) {
						console.log(`Setting ${type}_netmask to:`, mask);
						uci.set('firewall', self.currentRuleSection, type + '_netmask', mask);
					}
				}
			}
		};
		
		// UCI에서 Rule Config 폼으로 데이터 로드
		this.loadRuleConfig = function(sectionId) {
			self.currentRuleSection = sectionId;
			var container = document.getElementById('rule-config');
			if (!container) return;
			
			// enabled 설정 로드
			var enabled = uci.get('firewall', sectionId, 'enabled');
			var enabledCheckbox = container.querySelector('input[data-uci="enabled"]');
			if (enabledCheckbox) {
				enabledCheckbox.checked = (enabled === '1');
			}
			
			// target 설정 로드
			var target = uci.get('firewall', sectionId, 'target');
			var targetSelect = container.querySelector('select[data-uci="target"]');
			if (targetSelect && target) {
				targetSelect.value = target;
			}
			
			// proto 설정 로드
			var proto = uci.get('firewall', sectionId, 'proto');
			var protoSelect = container.querySelector('select[data-uci="proto"]');
			if (protoSelect && proto) {
				protoSelect.value = (proto === 'all') ? 'ANY' : proto;
			}
			
			// name(우선순위) 설정 로드
			var name = uci.get('firewall', sectionId, 'name');
			var priorityInput = container.querySelector('input[data-uci="priority"]');
			if (priorityInput && name) {
				priorityInput.value = name;
			}
			
			// comment 설정 로드
			var comment = uci.get('firewall', sectionId, 'comment');
			var commentInput = container.querySelector('input[data-uci="comment"]');
			if (commentInput && comment) {
				commentInput.value = comment;
			}
			
			// Stateful Inspection 설정 로드
			var extra = uci.get('firewall', sectionId, 'extra');
			var statefulMain = container.querySelector('input[data-uci="stateful_enabled"]');
			var statefulNew = container.querySelector('input[data-uci="stateful_new"]');
			var statefulEstablished = container.querySelector('input[data-uci="stateful_established"]');
			var statefulRelated = container.querySelector('input[data-uci="stateful_related"]');
			var statefulInvalid = container.querySelector('input[data-uci="stateful_invalid"]');
			
			if (extra && extra.indexOf('conntrack') !== -1) {
				if (statefulMain) {
					statefulMain.checked = true;
					// 토글 기능 실행하여 세부 옵션 표시
					self.toggleStatefulOptions();
				}
				
				// ctstate 파라미터에서 상태들 파싱
				if (extra.indexOf('--ctstate') !== -1) {
					var stateMatch = extra.match(/--ctstate\s+([A-Z,]+)/);
					if (stateMatch) {
						var states = stateMatch[1].split(',');
						states.forEach(function(state) {
							switch(state.trim()) {
								case 'NEW':
									if (statefulNew) statefulNew.checked = true;
									break;
								case 'ESTABLISHED':
									if (statefulEstablished) statefulEstablished.checked = true;
									break;
								case 'RELATED':
									if (statefulRelated) statefulRelated.checked = true;
									break;
								case 'INVALID':
									if (statefulInvalid) statefulInvalid.checked = true;
									break;
							}
						});
					}
				}
			} else {
				// Stateful inspection이 비활성화된 경우
				if (statefulMain) {
					statefulMain.checked = false;
					self.toggleStatefulOptions();
				}
			}
			
			// IP 주소 로드
			self.loadIPAddress('src', sectionId);
			self.loadIPAddress('dest', sectionId);
		};
		
		// 점 형태의 IP를 4개 필드로 분할하여 로드 (원래 방식 유지)
		this.loadIPAddress = function(type, sectionId) {
			var container = document.getElementById('rule-config');
			var ip = uci.get('firewall', sectionId, type + '_ip');
			var mask = uci.get('firewall', sectionId, type + '_netmask');
			
			if (ip) {
				// IP 주소를 4개 필드에 설정
				var ipParts = ip.split('.');
				var ipInputs = container.querySelectorAll(`input[data-uci="${type}_ip"]`);
				ipInputs.forEach((input, index) => {
					input.value = ipParts[index] || '';
				});
			}
			
			if (mask) {
				// 넷마스크를 4개 필드에 설정
				var maskParts = mask.split('.');
				var maskInputs = container.querySelectorAll(`input[data-uci="${type}_mask"]`);
				maskInputs.forEach((input, index) => {
					input.value = maskParts[index] || '';
				});
			}
		};
		
		// Rule 옵션 순서를 재조정하는 함수 (name을 맨 앞에)
		this.reorderRuleOptions = function() {
			console.log('Reordering rule options to put name first');
			
			if (!self.currentRuleSection) {
				console.log('No current rule section to reorder');
				return Promise.resolve();
			}
			
			// 현재 rule의 모든 옵션 값 백업
			var section = uci.get('firewall', self.currentRuleSection);
			if (!section) {
				console.log('Rule section not found:', self.currentRuleSection);
				return Promise.resolve();
			}
			
			// rule section을 제거하고 다시 생성
			uci.remove('firewall', self.currentRuleSection);
			var newSid = uci.add('firewall', 'rule');
			
			// 원하는 순서로 옵션 설정
			var orderedOptions = [
				'name',      // 우선순위 (맨 앞)
				'enabled',   // 사용여부
				'target',    // 행위
				'proto',     // 프로토콜
				'src',       // 출발지 zone
				'src_ip',    // 출발지 IP
				'src_netmask', // 출발지 넷마스크
				'src_port',  // 출발지 포트
				'dest',      // 목적지 zone  
				'dest_ip',   // 목적지 IP
				'dest_netmask', // 목적지 넷마스크
				'dest_port', // 목적지 포트
				'extra',     // Stateful Inspection
				'comment'    // 주석 (맨 마지막)
			];
			
			// 순서대로 옵션 설정
			orderedOptions.forEach(function(optionName) {
				if (section[optionName] !== undefined) {
					uci.set('firewall', newSid, optionName, section[optionName]);
					console.log('Set ordered option:', optionName, '=', section[optionName]);
				}
			});
			
			// 순서에 없는 다른 옵션들도 추가
			Object.keys(section).forEach(function(key) {
				if (key.indexOf('.') !== 0 && orderedOptions.indexOf(key) === -1) {
					uci.set('firewall', newSid, key, section[key]);
					console.log('Set additional option:', key, '=', section[key]);
				}
			});
			
			// 새로운 section ID 업데이트
			self.currentRuleSection = newSid;
			console.log('Rule options reordered, new section ID:', newSid);
			
			// 변경사항 저장
			return uci.save().then(function() {
				console.log('Rule reordering completed');
				return Promise.resolve();
			}).catch(function(err) {
				console.error('Failed to save rule reordering:', err);
				return Promise.resolve(); // 실패해도 계속 진행
			});
		};
		
		// PBR include를 파일 맨 아래로 이동시키는 함수
		this.movePBRIncludeToBottom = function() {
			console.log('Moving PBR include to bottom of firewall config');
			
			// firewall 설정의 모든 섹션 가져오기
			var sections = uci.sections('firewall');
			var pbrIncludeSections = [];
			var otherSections = [];
			
			// PBR include 섹션과 다른 섹션들 분리
			sections.forEach(function(section) {
				if (section['.type'] === 'include' && 
					(section['.name'] === 'pbr' || 
					 section.path === '/usr/share/pbr/firewall.include' ||
					 section['.name'].indexOf('pbr') !== -1)) {
					pbrIncludeSections.push(section);
				} else {
					otherSections.push(section);
				}
			});
			
			console.log('Found PBR include sections:', pbrIncludeSections.length);
			console.log('Found other sections:', otherSections.length);
			
			// PBR include 섹션이 있으면 재배치
			if (pbrIncludeSections.length > 0) {
				// PBR include 섹션들을 임시로 제거
				pbrIncludeSections.forEach(function(section) {
					console.log('Removing PBR section temporarily:', section['.name']);
					uci.remove('firewall', section['.name']);
				});
				
				// PBR include 섹션들을 다시 추가 (맨 마지막에 추가됨)
				pbrIncludeSections.forEach(function(section) {
					console.log('Re-adding PBR section at bottom:', section['.name']);
					var newSid = uci.add('firewall', 'include');
					
					// 원본 데이터 복사
					Object.keys(section).forEach(function(key) {
						if (key !== '.type' && key !== '.name' && key !== '.anonymous') {
							uci.set('firewall', newSid, key, section[key]);
						}
					});
					
					// 특정 PBR 속성들 설정
					if (section['.name'] === 'pbr' || section.path === '/usr/share/pbr/firewall.include') {
						uci.set('firewall', newSid, 'fw4_compatible', '0');
						uci.set('firewall', newSid, 'type', 'script');
						uci.set('firewall', newSid, 'path', '/usr/share/pbr/firewall.include');
					}
				});
				
				console.log('PBR include sections moved to bottom');
				
				// 변경사항 저장
				return uci.save().then(function() {
					console.log('PBR repositioning completed');
					return Promise.resolve();
				}).catch(function(err) {
					console.error('Failed to save PBR repositioning:', err);
					return Promise.resolve(); // 실패해도 계속 진행
				});
			} else {
				console.log('No PBR include sections found');
				return Promise.resolve();
			}
		};
	},

	load: function() {
		return Promise.all([
			this.callHostHints(),
			this.callConntrackHelpers(),
			uci.load('firewall'),
			uci.load('network')  // 네트워크 인터페이스 정보도 로드
		]);
	},

	render: function(data) {
		if (fwtool.checkLegacySNAT())
			return fwtool.renderMigration();
		else
			return this.renderControlWithTabs(data);
	},

	renderControlWithTabs: function(data) {
		var hosts = data[0],
		    ctHelpers = data[1],
		    m, s, o;
		var self = this;

		// CSS 스타일 추가
		var style = E('style', {}, `
			.control-container {
				margin: 0;
				padding: 0;
			}
			.control-header {
				background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
				border-bottom: 1px solid #dee2e6;
				padding: 20px 30px;
				box-shadow: inset 0 1px 0 rgba(255,255,255,0.8), 0 1px 2px rgba(0,0,0,0.05);
			}
			.control-header h2 {
				margin: 0 0 8px 0;
				color: #2c3e50;
				text-shadow: 0 1px 0 rgba(255,255,255,0.5);
				font-size: 24px;
				font-weight: 600;
			}
			.control-header p {
				margin: 0;
				color: #6c757d;
				font-size: 14px;
			}
			.control-tabs {
				display: flex;
				background: linear-gradient(135deg, #f1f3f4 0%, #e8eaed 100%);
				border-bottom: 1px solid #dadce0;
				margin: 0;
				padding: 0 30px;
				box-shadow: inset 0 -1px 0 rgba(0,0,0,0.1);
			}
			.control-tab {
				padding: 8px 16px;
				cursor: pointer;
				border: 1px solid #dadce0;
				border-bottom: none;
				background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
				margin-right: 2px;
				margin-top: 4px;
				border-radius: 6px 6px 0 0;
				transition: all 0.2s ease;
				color: #495057;
				font-weight: 500;
				box-shadow: 0 -2px 4px rgba(0,0,0,0.1);
				min-width: 120px;
				max-width: 120px;
				flex: 0 0 120px !important;
				justify-content: center;
				text-align: center;
			}
			.control-tab:hover {
				background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
				transform: translateY(-1px);
			}
			.control-tab.active {
				background: linear-gradient(135deg, #ffffff 0%, #fafbfc 100%);
				border-bottom: 1px solid white;
				margin-bottom: -1px;
				color: #2c3e50;
				box-shadow: 0 -3px 6px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8);
				z-index: 10;
				position: relative;
			}
			.control-content {
				display: none;
				padding: 0px 2px 10px 2px;
				background: #ffffff;
				min-height: 400px;
			}
			.control-content.active {
				display: block;
			}
			.rule-config-box {
				background: #ffffff;
				border: 1px solid #d4d4d4;
				border-radius: 8px;
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1);
				margin: 0;
				padding: 12px;
			}
			.narrow-select {
				width: 120px !important;
				min-width: 120px !important;
				max-width: 120px !important;
			}
			.very-narrow-select {
				width: 80px !important;
				min-width: 80px !important;
				max-width: 80px !important;
			}
		`);

		// Traffic Rules 생성 (원본 rules.js와 완전히 동일)
		m = new form.Map('firewall');
		s = m.section(form.GridSection, 'rule');
		s.addremove = true;
		s.anonymous = true;
		s.sortable  = true;
		s.cloneable = false;

		s.tab('general', _('General Settings'));
		s.tab('advanced', _('Advanced Settings'));
		s.tab('timed', _('Time Restrictions'));

		s.filter = function(section_id) {
			return (uci.get('firewall', section_id, 'target') != 'SNAT');
		};

		s.sectiontitle = function(section_id) {
			return uci.get('firewall', section_id, 'name') || _('Unnamed rule');
		};


		o = s.taboption('general', form.Value, 'name', _('Name'));
		o.placeholder = _('Unnamed rule');
		o.modalonly = true;

		o = s.option(form.DummyValue, '_match', _('Match'));
		o.modalonly = false;
		o.textvalue = function(s) {
			return E('small', [
				rule_proto_txt(s, ctHelpers), E('br'),
				rule_src_txt(s, hosts), E('br'),
				rule_dest_txt(s), E('br'),
				rule_limit_txt(s)
			]);
		};

		o = s.option(form.ListValue, '_target', _('Action'));
		o.modalonly = false;
		o.textvalue = function(s) {
			return rule_target_txt(s, ctHelpers);
		};

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.modalonly = false;
		o.default = o.enabled;
		o.editable = true;
		o.tooltip = function(section_id) {
			var weekdays = uci.get('firewall', section_id, 'weekdays');
			var monthdays = uci.get('firewall', section_id, 'monthdays');
			var start_time = uci.get('firewall', section_id, 'start_time');
			var stop_time = uci.get('firewall', section_id, 'stop_time');
			var start_date = uci.get('firewall', section_id, 'start_date');
			var stop_date = uci.get('firewall', section_id, 'stop_date');

			if (weekdays || monthdays || start_time || stop_time || start_date || stop_date )
				return _('Time restrictions are enabled for this rule');

			return null;
		};

		o = s.taboption('advanced', form.ListValue, 'direction', _('Match device'));
		o.modalonly = true;
		o.value('', _('unspecified'));
		o.value('in', _('Inbound device'));
		o.value('out', _('Outbound device'));
		o.cfgvalue = function(section_id) {
			var val = uci.get('firewall', section_id, 'direction');
			switch (val) {
				case 'in':
				case 'ingress':
					return 'in';

				case 'out':
				case 'egress':
					return 'out';
			}

			return null;
		};

		o = s.taboption('advanced', widgets.DeviceSelect, 'device', _('Device name'),
			_('Specifies whether to tie this traffic rule to a specific inbound or outbound network device.'));
		o.modalonly = true;
		o.noaliases = true;
		o.rmempty = false;
		o.depends('direction', 'in');
		o.depends('direction', 'out');

		o = s.taboption('advanced', form.ListValue, 'family', _('Restrict to address family'));
		o.modalonly = true;
		o.rmempty = true;
		o.value('', _('IPv4 and IPv6'));
		o.value('ipv4', _('IPv4 only'));
		o.value('ipv6', _('IPv6 only'));
		o.validate = function(section_id, value) {
			fwtool.updateHostHints(this.map, section_id, 'src_ip', value, hosts);
			fwtool.updateHostHints(this.map, section_id, 'dest_ip', value, hosts);
			return true;
		};

		o = s.taboption('general', fwtool.CBIProtocolSelect, 'proto', _('Protocol'));
		o.modalonly = true;
		o.default = 'tcp udp';

		o = s.taboption('advanced', form.MultiValue, 'icmp_type', _('Match ICMP type'));
		o.modalonly = true;
		o.multiple = true;
		o.custom = true;
		o.cast = 'table';
		o.placeholder = _('any/all');
		o.value('address-mask-reply');
		o.value('address-mask-request');
		o.value('address-unreachable'); /* icmpv6 1:3 */
		o.value('bad-header');  /* icmpv6 4:0 */
		o.value('certification-path-solicitation-message'); /* icmpv6 148 */
		o.value('certification-path-advertisement-message'); /* icmpv6 149 */
		o.value('communication-prohibited');
		o.value('destination-unreachable');
		o.value('duplicate-address-request'); /* icmpv6 157 */
		o.value('duplicate-address-confirmation'); /* icmpv6 158 */
		o.value('echo-reply');
		o.value('echo-request');
		o.value('extended-echo-request'); /* icmpv6 160 */
		o.value('extended-echo-reply'); /* icmpv6 161 */
		o.value('fmipv6-message'); /* icmpv6 154 */
		o.value('fragmentation-needed');
		o.value('home-agent-address-discovery-reply-message'); /* icmpv6 145 */
		o.value('home-agent-address-discovery-request-message'); /* icmpv6 144 */
		o.value('host-precedence-violation');
		o.value('host-prohibited');
		o.value('host-redirect');
		o.value('host-unknown');
		o.value('host-unreachable');
		o.value('ilnpv6-locator-update-message'); /* icmpv6 156 */
		o.value('inverse-neighbour-discovery-advertisement-message'); /* icmpv6 142 */
		o.value('inverse-neighbour-discovery-solicitation-message'); /* icmpv6 141 */
		o.value('ip-header-bad');
		o.value('mobile-prefix-advertisement'); /* icmpv6 147 */
		o.value('mobile-prefix-solicitation'); /* icmpv6 146 */
		o.value('mpl-control-message'); /* icmpv6 159 */
		o.value('multicast-listener-query'); /* icmpv6 130 */
		o.value('multicast-listener-report'); /* icmpv6 131 */
		o.value('multicast-listener-done'); /* icmpv6 132 */
		o.value('multicast-router-advertisement'); /* icmpv6 151 */
		o.value('multicast-router-solicitation'); /* icmpv6 152 */
		o.value('multicast-router-termination'); /* icmpv6 153 */
		o.value('neighbour-advertisement');
		o.value('neighbour-solicitation');
		o.value('network-prohibited');
		o.value('network-redirect');
		o.value('network-unknown');
		o.value('network-unreachable');
		o.value('no-route'); /* icmpv6 1:0 */
		o.value('node-info-query'); /* icmpv6 139 */
		o.value('node-info-response'); /* icmpv6 140 */
		o.value('packet-too-big');
		o.value('parameter-problem');
		o.value('port-unreachable');
		o.value('precedence-cutoff');
		o.value('protocol-unreachable');
		o.value('redirect');
		o.value('required-option-missing');
		o.value('router-advertisement');
		o.value('router-renumbering'); /* icmpv6 138 */
		o.value('router-solicitation');
		o.value('rpl-control-message'); /* icmpv6 155 */
		o.value('source-quench');
		o.value('source-route-failed');
		o.value('time-exceeded');
		o.value('timestamp-reply');
		o.value('timestamp-request');
		o.value('TOS-host-redirect');
		o.value('TOS-host-unreachable');
		o.value('TOS-network-redirect');
		o.value('TOS-network-unreachable');
		o.value('ttl-zero-during-reassembly');
		o.value('ttl-zero-during-transit');
		o.value('v2-multicast-listener-report'); /* icmpv6 143 */
		o.value('unknown-header-type'); /* icmpv6 4:1 */
		o.value('unknown-option'); /* icmpv6 4:2 */
		o.depends({ proto: 'icmp', '!contains': true });
		o.depends({ proto: 'icmpv6', '!contains': true });

		o = s.taboption('general', widgets.ZoneSelect, 'src', _('Source zone'));
		o.modalonly = true;
		o.nocreate = true;
		o.allowany = true;
		o.allowlocal = 'src';

		o = s.taboption('advanced', form.Value, 'ipset', _('Use ipset'));
		uci.sections('firewall', 'ipset', function(s) {
			if (typeof(s.name) == 'string')
				o.value(s.name, s.comment ? '%s (%s)'.format(s.name, s.comment) : s.name);
		});
		o.modalonly = true;
		o.rmempty = true;

		fwtool.addMACOption(s, 'advanced', 'src_mac', _('Source MAC address'), null, hosts);
		fwtool.addIPOption(s, 'general', 'src_ip', _('Source address'), null, '', hosts, true);

		o = s.taboption('general', form.Value, 'src_port', _('Source port'));
		o.modalonly = true;
		o.datatype = 'list(neg(portrange))';
		o.placeholder = _('any');
		o.depends({ proto: 'tcp', '!contains': true });
		o.depends({ proto: 'udp', '!contains': true });

		o = s.taboption('general', widgets.ZoneSelect, 'dest', _('Destination zone'));
		o.modalonly = true;
		o.nocreate = true;
		o.allowany = true;
		o.allowlocal = true;

		fwtool.addIPOption(s, 'general', 'dest_ip', _('Destination address'), null, '', hosts, true);

		o = s.taboption('general', form.Value, 'dest_port', _('Destination port'));
		o.modalonly = true;
		o.datatype = 'list(neg(portrange))';
		o.placeholder = _('any');
		o.depends({ proto: 'tcp', '!contains': true });
		o.depends({ proto: 'udp', '!contains': true });

		o = s.taboption('general', form.ListValue, 'target', _('Action'));
		o.modalonly = true;
		o.default = 'ACCEPT';
		o.value('DROP', _('drop'));
		o.value('ACCEPT', _('accept'));
		o.value('REJECT', _('reject'));
		o.value('NOTRACK', _("don't track"));
		o.value('HELPER', _('assign conntrack helper'));
		o.value('MARK_SET', _('apply firewall mark'));
		o.value('MARK_XOR', _('XOR firewall mark'));
		o.value('DSCP', _('DSCP classification'));
		o.cfgvalue = function(section_id) {
			var t = uci.get('firewall', section_id, 'target'),
			    m = uci.get('firewall', section_id, 'set_mark');

			if (t == 'MARK')
				return m ? 'MARK_SET' : 'MARK_XOR';

			return t;
		};
		o.write = function(section_id, value) {
			return this.super('write', [section_id, (value == 'MARK_SET' || value == 'MARK_XOR') ? 'MARK' : value]);
		};

		fwtool.addMarkOption(s, 1);
		fwtool.addMarkOption(s, 2);
		fwtool.addDSCPOption(s, true);

		o = s.taboption('general', form.ListValue, 'set_helper', _('Tracking helper'), _('Assign the specified connection tracking helper to matched traffic.'));
		o.modalonly = true;
		o.placeholder = _('any');
		o.depends('target', 'HELPER');
		for (var i = 0; i < ctHelpers.length; i++)
			o.value(ctHelpers[i].name, '%s (%s)'.format(ctHelpers[i].description, ctHelpers[i].name.toUpperCase()));

		o = s.taboption('advanced', form.Value, 'helper', _('Match helper'), _('Match traffic using the specified connection tracking helper.'));
		o.modalonly = true;
		o.placeholder = _('any');
		for (var i = 0; i < ctHelpers.length; i++)
			o.value(ctHelpers[i].name, '%s (%s)'.format(ctHelpers[i].description, ctHelpers[i].name.toUpperCase()));
		o.validate = function(section_id, value) {
			if (value == '' || value == null)
				return true;

			value = value.replace(/^!\s*/, '');

			for (var i = 0; i < ctHelpers.length; i++)
				if (value == ctHelpers[i].name)
					return true;

			return _('Unknown or not installed conntrack helper "%s"').format(value);
		};

		fwtool.addMarkOption(s, false);
		fwtool.addDSCPOption(s, false);
		fwtool.addLimitOption(s);
		fwtool.addLimitBurstOption(s);

		if (!L.hasSystemFeature('firewall4')) {
			o = s.taboption('advanced', form.Value, 'extra', _('Extra arguments'),
				_('Passes additional arguments to iptables. Use with care!'));
			o.modalonly = true;
		}

		o = s.taboption('timed', form.MultiValue, 'weekdays', _('Week Days'));
		o.modalonly = true;
		o.multiple = true;
		o.display = 5;
		o.placeholder = _('Any day');
		o.value('Sun', _('Sunday'));
		o.value('Mon', _('Monday'));
		o.value('Tue', _('Tuesday'));
		o.value('Wed', _('Wednesday'));
		o.value('Thu', _('Thursday'));
		o.value('Fri', _('Friday'));
		o.value('Sat', _('Saturday'));
		o.write = function(section_id, value) {
			return this.super('write', [ section_id, L.toArray(value).join(' ') ]);
		};

		o = s.taboption('timed', form.MultiValue, 'monthdays', _('Month Days'));
		o.modalonly = true;
		o.multiple = true;
		o.display_size = 15;
		o.placeholder = _('Any day');
		o.write = function(section_id, value) {
			return this.super('write', [ section_id, L.toArray(value).join(' ') ]);
		};
		for (var i = 1; i <= 31; i++)
			o.value(i);

		o = s.taboption('timed', form.Value, 'start_time', _('Start Time (hh:mm:ss)'));
		o.modalonly = true;
		o.datatype = 'timehhmmss';

		o = s.taboption('timed', form.Value, 'stop_time', _('Stop Time (hh:mm:ss)'));
		o.modalonly = true;
		o.datatype = 'timehhmmss';

		o = s.taboption('timed', form.Value, 'start_date', _('Start Date (yyyy-mm-dd)'));
		o.modalonly = true;
		o.datatype = 'dateyyyymmdd';

		o = s.taboption('timed', form.Value, 'stop_date', _('Stop Date (yyyy-mm-dd)'));
		o.modalonly = true;
		o.datatype = 'dateyyyymmdd';

		o = s.taboption('timed', form.Flag, 'utc_time', _('Time in UTC'));
		o.modalonly = true;
		o.default = o.disabled;

		
		// Traffic Rule 탭 컨테이너를 미리 생성
		var trafficRuleContainer = E('div', { 'class': 'control-content active', 'id': 'traffic-rule' }, [
			E('div', {}, _('Loading traffic rules...'))
		]);

		// 메인 컨테이너
		var container = E('div', { 'class': 'control-container' }, [
			style,
			
			// 헤더 섹션
			E('div', { 'class': 'control-header' }, [
				E('h2', {}, _('Firewall - Transmission Control')),
				E('p', {}, _('Transmission control allows you to configure traffic rules and advanced rule configuration for network transmission management.'))
			]),
			
			// 탭 헤더
			E('div', { 'class': 'control-tabs' }, [
				E('div', { 
					'class': 'control-tab active',
					'data-tab': 'traffic-rule',
					'click': function() { switchTab('traffic-rule'); }
				}, _('Traffic Rule')),
				E('div', { 
					'class': 'control-tab',
					'data-tab': 'rule-config', 
					'click': function() { switchTab('rule-config'); }
				}, _('Rule Config'))
			]),
			
			// Traffic Rule 탭 내용
			trafficRuleContainer,
			
			// Rule Config 탭 내용 (fire9.png 디자인)
			E('div', { 
				'class': 'control-content', 
				'id': 'rule-config',
				'change': function() {
					// 변경사항 감지하여 저장 버튼 활성화
					if (typeof ui !== 'undefined' && ui.changes) {
						ui.changes.setIndicator(true);
					}
				}
			}, [
				E('div', { 'class': 'rule-config-box' }, [
					// 사용여부 줄
					E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px; font-weight: bold;' }, _('사용여부')),
						E('input', { 
							'type': 'checkbox', 
							'style': 'margin-right: 8px;', 
							'data-uci': 'enabled', 
							'checked': true,
							'change': function() { 
								console.log('enabled changed:', this.checked);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}),
						E('span', {}, _('사용'))
					]),

					// 우선순위, 동작, 입력인터페이스, 로그 줄
					E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px;' }, _('')),
						E('label', { 'style': 'margin-right: 8px;' }, _('우선순위')),
						E('input', { 
							'type': 'text', 
							'value': '1', 
							'style': 'width: 60px; margin-right: 20px;',
							'data-uci': 'priority',
							'change': function() { 
								console.log('priority changed:', this.value);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}),
						
						E('label', { 'style': 'margin-right: 8px;' }, _('행위')),
						E('select', { 
							'class': 'narrow-select', 
							'style': 'margin-right: 20px;', 
							'data-uci': 'target',
							'change': function() { 
								console.log('target changed:', this.value);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}, [
							E('option', { 'value': 'ACCEPT', 'selected': true }, 'ACCEPT'),
							E('option', { 'value': 'DROP' }, 'DROP'),
							E('option', { 'value': 'REJECT' }, 'REJECT'),
							E('option', { 'value': 'NOTRACK' }, "NOTRACK")
						]),
						
						E('label', { 'style': 'margin-right: 8px;' }, _('입력인터페이스')),
						E('select', { 
							'class': 'narrow-select', 
							'style': 'margin-right: 20px;', 
							'data-uci': 'src',
							'change': function() { 
								console.log('src changed:', this.value);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}, [
							E('option', { 'value': '' }, _('Loading...'))
						]),
						
						E('label', { 'style': 'margin-right: 8px;' }, _('로그')),
						E('input', { 'type': 'checkbox', 'style': 'margin-right: 8px;' }),
						E('span', {}, _('사용'))
					]),

					// 프로토콜 줄
					E('div', { 'style': 'margin-bottom: 20px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px; font-weight: bold;' }, _('프로토콜')),
						E('select', { 
							'style': 'width: 200px;', 
							'data-uci': 'proto',
							'change': function() { 
								console.log('proto changed:', this.value);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}, [
							E('option', { 'value': 'tcp udp' }, 'TCP+UDP'),
							E('option', { 'value': 'tcp' }, 'TCP'),
							E('option', { 'value': 'udp' }, 'UDP'),
							E('option', { 'value': 'icmp' }, 'ICMP'),
							E('option', { 'value': 'esp' }, 'ESP'),
							E('option', { 'value': 'ah' }, 'AH'),
							E('option', { 'value': 'sctp' }, 'SCTP'),
							E('option', { 'value': 'all', 'selected': true }, 'Any')
						])
					]),

					// 간격 추가
					E('div', { 'style': 'height: 15px;' }),

					// 출발지
					E('div', { 'style': 'margin-bottom: 20px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px; font-weight: bold;' }, _('출발지')),
						E('input', { 'type': 'checkbox', 'style': 'margin-right: 8px;' }),
						E('span', {}, _('역주소'))
					]),
					
					E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px;' }, _('IP 타입')),
						E('select', { 
							'style': 'width: 200px;', 
							'id': 'src-ip-type',
							'data-target': 'src',
							'change': function() { 
								ui.changes.setIndicator(true);
								self.updateIPAddressDropdown(this.value, this.dataset.target);
							}
						}, [
							E('option', { 'value': 'direct' }, _('직접입력(네트워크)'))
						])
					]),
					
					E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px;' }, _('IP 주소')),
						E('select', { 
							'style': 'width: 300px; display: none;', 
							'id': 'src-ip-dropdown',
							'change': function() { 
								ui.changes.setIndicator(true);
								self.populateIPFields(this.value, 'src');
							}
						}, [
							E('option', { 'value': '' }, _('-- IP 주소 선택 --'))
						])
					]),
					
					E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px;' }, _('IP 주소')),
						E('input', { 
							'type': 'text', 
							'style': 'width: 60px; margin-right: 5px;', 
							'data-uci': 'src_ip', 
							'placeholder': '192',
							'change': function() { 
								console.log('src_ip field 1 changed:', this.value);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}),
						E('span', { 'style': 'margin-right: 5px;' }, '.'),
						E('input', { 
							'type': 'text', 
							'style': 'width: 60px; margin-right: 5px;', 
							'data-uci': 'src_ip', 
							'placeholder': '168',
							'change': function() { 
								console.log('src_ip field 2 changed:', this.value);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}),
						E('span', { 'style': 'margin-right: 5px;' }, '.'),
						E('input', { 
							'type': 'text', 
							'style': 'width: 60px; margin-right: 5px;', 
							'data-uci': 'src_ip', 
							'placeholder': '1',
							'change': function() { 
								console.log('src_ip field 3 changed:', this.value);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}),
						E('span', { 'style': 'margin-right: 5px;' }, '.'),
						E('input', { 
							'type': 'text', 
							'style': 'width: 60px;', 
							'data-uci': 'src_ip', 
							'placeholder': '0',
							'change': function() { 
								console.log('src_ip field 4 changed:', this.value);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						})
					]),
					
					E('div', { 'style': 'margin-bottom: 20px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px;' }, _('넷마스크')),
						E('input', { 'type': 'text', 'style': 'width: 60px; margin-right: 5px;', 'data-uci': 'src_mask', 'placeholder': '255', 'value': '255', 'change': function() { ui.changes.setIndicator(true); } }),
						E('span', { 'style': 'margin-right: 5px;' }, '.'),
						E('input', { 'type': 'text', 'style': 'width: 60px; margin-right: 5px;', 'data-uci': 'src_mask', 'placeholder': '255', 'value': '255', 'change': function() { ui.changes.setIndicator(true); } }),
						E('span', { 'style': 'margin-right: 5px;' }, '.'),
						E('input', { 'type': 'text', 'style': 'width: 60px; margin-right: 5px;', 'data-uci': 'src_mask', 'placeholder': '255', 'value': '255', 'change': function() { ui.changes.setIndicator(true); } }),
						E('span', { 'style': 'margin-right: 5px;' }, '.'),
						E('input', { 'type': 'text', 'style': 'width: 60px;', 'data-uci': 'src_mask', 'placeholder': '0', 'value': '0', 'change': function() { ui.changes.setIndicator(true); } })
					]),

					// 간격 추가
					E('div', { 'style': 'height: 15px;' }),

					// 목적지
					E('div', { 'style': 'margin-bottom: 20px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px; font-weight: bold;' }, _('목적지')),
						E('input', { 'type': 'checkbox', 'style': 'margin-right: 8px;' }),
						E('span', {}, _('역주소'))
					]),
					
					E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px;' }, _('IP 타입')),
						E('select', { 
							'style': 'width: 200px;', 
							'id': 'dest-ip-type',
							'data-target': 'dest',
							'change': function() { 
								ui.changes.setIndicator(true);
								self.updateIPAddressDropdown(this.value, this.dataset.target);
							}
						}, [
							E('option', { 'value': 'direct' }, _('직접입력(네트워크)'))
						])
					]),
					
					E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px;' }, _('IP 주소')),
						E('select', { 
							'style': 'width: 300px; display: none;', 
							'id': 'dest-ip-dropdown',
							'change': function() { 
								ui.changes.setIndicator(true);
								self.populateIPFields(this.value, 'dest');
							}
						}, [
							E('option', { 'value': '' }, _('-- IP 주소 선택 --'))
						])
					]),
					
					E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px;' }, _('IP 주소')),
						E('input', { 'type': 'text', 'style': 'width: 60px; margin-right: 5px;', 'data-uci': 'dest_ip', 'placeholder': '0', 'change': function() { ui.changes.setIndicator(true); } }),
						E('span', { 'style': 'margin-right: 5px;' }, '.'),
						E('input', { 'type': 'text', 'style': 'width: 60px; margin-right: 5px;', 'data-uci': 'dest_ip', 'placeholder': '0', 'change': function() { ui.changes.setIndicator(true); } }),
						E('span', { 'style': 'margin-right: 5px;' }, '.'),
						E('input', { 'type': 'text', 'style': 'width: 60px; margin-right: 5px;', 'data-uci': 'dest_ip', 'placeholder': '0', 'change': function() { ui.changes.setIndicator(true); } }),
						E('span', { 'style': 'margin-right: 5px;' }, '.'),
						E('input', { 'type': 'text', 'style': 'width: 60px;', 'data-uci': 'dest_ip', 'placeholder': '0', 'change': function() { ui.changes.setIndicator(true); } })
					]),
					
					E('div', { 'style': 'margin-bottom: 20px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px;' }, _('넷마스크')),
						E('input', { 'type': 'text', 'style': 'width: 60px; margin-right: 5px;', 'data-uci': 'dest_mask', 'placeholder': '0', 'value': '0', 'change': function() { ui.changes.setIndicator(true); } }),
						E('span', { 'style': 'margin-right: 5px;' }, '.'),
						E('input', { 'type': 'text', 'style': 'width: 60px; margin-right: 5px;', 'data-uci': 'dest_mask', 'placeholder': '0', 'value': '0', 'change': function() { ui.changes.setIndicator(true); } }),
						E('span', { 'style': 'margin-right: 5px;' }, '.'),
						E('input', { 'type': 'text', 'style': 'width: 60px; margin-right: 5px;', 'data-uci': 'dest_mask', 'placeholder': '0', 'value': '0', 'change': function() { ui.changes.setIndicator(true); } }),
						E('span', { 'style': 'margin-right: 5px;' }, '.'),
						E('input', { 'type': 'text', 'style': 'width: 60px;', 'data-uci': 'dest_mask', 'placeholder': '0', 'value': '0', 'change': function() { ui.changes.setIndicator(true); } })
					]),

					// 간격 추가
					E('div', { 'style': 'height: 15px;' }),

					// 타임아웃 (Time Restrictions)
					E('div', { 'style': 'margin-bottom: 20px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px; font-weight: bold;' }, _('타임아웃')),
						E('input', { 
							'type': 'checkbox', 
							'style': 'margin-right: 8px;',
							'id': 'time-restrictions-enable',
							'change': function() { 
								ui.changes.setIndicator(true);
								var container = document.getElementById('time-restrictions-settings');
								if (container) {
									container.style.display = this.checked ? 'block' : 'none';
								}
							}
						}),
						E('span', {}, _('사용'))
					]),

					// Time Restrictions 설정 영역 (기존 timed 탭 필드들 복사)
					E('div', { 
						'id': 'time-restrictions-settings',
						'style': 'display: none; margin-left: 135px; padding: 15px; border: 1px solid #ddd; background: #f9f9f9; border-radius: 5px; margin-bottom: 20px;'
					}, [
						E('h4', { 'style': 'margin: 0 0 15px 0; color: #333;' }, _('Time Restrictions')),
						
						// Week Days (기존 코드 복사)
						E('div', { 'style': 'margin-bottom: 15px;' }, [
							E('label', { 'style': 'font-weight: bold; display: block; margin-bottom: 5px;' }, _('Week Days')),
							E('div', { 'style': 'display: flex; gap: 15px; flex-wrap: wrap;' }, [
								E('label', {}, [E('input', { 'type': 'checkbox', 'data-uci': 'weekdays', 'value': 'Sun', 'change': function() { ui.changes.setIndicator(true); } }), ' ', _('Sunday')]),
								E('label', {}, [E('input', { 'type': 'checkbox', 'data-uci': 'weekdays', 'value': 'Mon', 'change': function() { ui.changes.setIndicator(true); } }), ' ', _('Monday')]),
								E('label', {}, [E('input', { 'type': 'checkbox', 'data-uci': 'weekdays', 'value': 'Tue', 'change': function() { ui.changes.setIndicator(true); } }), ' ', _('Tuesday')]),
								E('label', {}, [E('input', { 'type': 'checkbox', 'data-uci': 'weekdays', 'value': 'Wed', 'change': function() { ui.changes.setIndicator(true); } }), ' ', _('Wednesday')]),
								E('label', {}, [E('input', { 'type': 'checkbox', 'data-uci': 'weekdays', 'value': 'Thu', 'change': function() { ui.changes.setIndicator(true); } }), ' ', _('Thursday')]),
								E('label', {}, [E('input', { 'type': 'checkbox', 'data-uci': 'weekdays', 'value': 'Fri', 'change': function() { ui.changes.setIndicator(true); } }), ' ', _('Friday')]),
								E('label', {}, [E('input', { 'type': 'checkbox', 'data-uci': 'weekdays', 'value': 'Sat', 'change': function() { ui.changes.setIndicator(true); } }), ' ', _('Saturday')])
							])
						]),

						// Time Range
						E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center; gap: 10px;' }, [
							E('label', { 'style': 'font-weight: bold; min-width: 100px;' }, _('Start Time (hh:mm:ss)')),
							E('input', { 
								'type': 'text', 
								'placeholder': '00:00:00', 
								'style': 'width: 100px;', 
								'data-uci': 'start_time',
								'change': function() { ui.changes.setIndicator(true); }
							}),
							E('label', { 'style': 'font-weight: bold; margin-left: 20px; min-width: 100px;' }, _('Stop Time (hh:mm:ss)')),
							E('input', { 
								'type': 'text', 
								'placeholder': '23:59:59', 
								'style': 'width: 100px;', 
								'data-uci': 'stop_time',
								'change': function() { ui.changes.setIndicator(true); }
							})
						]),

						// Date Range
						E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center; gap: 10px;' }, [
							E('label', { 'style': 'font-weight: bold; min-width: 100px;' }, _('Start Date (yyyy-mm-dd)')),
							E('input', { 
								'type': 'date', 
								'style': 'width: 150px;', 
								'data-uci': 'start_date',
								'change': function() { ui.changes.setIndicator(true); }
							}),
							E('label', { 'style': 'font-weight: bold; margin-left: 20px; min-width: 100px;' }, _('Stop Date (yyyy-mm-dd)')),
							E('input', { 
								'type': 'date', 
								'style': 'width: 150px;', 
								'data-uci': 'stop_date',
								'change': function() { ui.changes.setIndicator(true); }
							})
						]),

						// Month Days
						E('div', { 'style': 'margin-bottom: 10px;' }, [
							E('label', { 'style': 'font-weight: bold; display: block; margin-bottom: 5px;' }, _('Month Days')),
							E('div', { 'style': 'display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; max-width: 400px;' }, 
								Array.from({length: 31}, (_, i) => i + 1).map(day => 
									E('label', { 'style': 'text-align: center; font-size: 12px;' }, [
										E('input', { 
											'type': 'checkbox', 
											'data-uci': 'monthdays', 
											'value': day.toString(),
											'change': function() { ui.changes.setIndicator(true); }
										}), 
										' ', day.toString()
									])
								)
							)
						])
					]),

					// Stateful Inspection
					E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px; font-weight: bold;' }, 'Stateful Inspection'),
						E('input', { 
							'type': 'checkbox', 
							'style': 'margin-right: 8px;',
							'id': 'stateful-main',
							'data-uci': 'stateful_enabled',
							'change': function() { 
								console.log('stateful main changed:', this.checked);
								self.toggleStatefulOptions();
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}),
						E('span', {}, _('사용'))
					]),
					
					// Stateful Inspection 세부 옵션 (처음에는 숨김)
					E('div', { 
						'id': 'stateful-options',
						'style': 'margin-bottom: 15px; display: none; align-items: center; margin-left: 135px;' 
					}, [
						E('input', { 
							'type': 'checkbox', 
							'style': 'margin-right: 5px;',
							'data-uci': 'stateful_new',
							'change': function() { 
								console.log('stateful new changed:', this.checked);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}),
						E('span', { 'style': 'margin-right: 15px;' }, 'New'),
						
						E('input', { 
							'type': 'checkbox', 
							'style': 'margin-right: 5px;',
							'data-uci': 'stateful_established',
							'change': function() { 
								console.log('stateful established changed:', this.checked);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}),
						E('span', { 'style': 'margin-right: 15px;' }, 'Established'),
						
						E('input', { 
							'type': 'checkbox', 
							'style': 'margin-right: 5px;',
							'data-uci': 'stateful_related',
							'change': function() { 
								console.log('stateful related changed:', this.checked);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}),
						E('span', { 'style': 'margin-right: 15px;' }, 'Related'),
						
						E('input', { 
							'type': 'checkbox', 
							'style': 'margin-right: 5px;',
							'data-uci': 'stateful_invalid',
							'change': function() { 
								console.log('stateful invalid changed:', this.checked);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						}),
						E('span', { 'style': 'margin-right: 15px;' }, 'Invalid')
					]),
					
					E('div', { 'style': 'margin-bottom: 20px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px; font-weight: bold;' }, _('정책 사용자')),
						E('input', { 'type': 'checkbox', 'style': 'margin-right: 8px;' }),
						E('span', {}, _('사용'))
					]),

					// 간격 추가
					E('div', { 'style': 'height: 15px;' }),

					// 제한 옵션
					E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px; font-weight: bold;' }, _('제한 옵션'))
					]),
					
					E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px;' }, _('빈도 제한')),
						E('input', { 'type': 'checkbox', 'style': 'margin-right: 8px;' }),
						E('span', {}, _('사용'))
					]),
					
					E('div', { 'style': 'margin-bottom: 15px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px;' }, _('세션제한')),
						E('input', { 'type': 'checkbox', 'style': 'margin-right: 8px;' }),
						E('span', {}, _('사용'))
					]),
					
					E('div', { 'style': 'margin-bottom: 20px; display: flex; align-items: center;' }, [
						E('label', { 'style': 'width: 120px; text-align: right; margin-right: 15px; font-weight: bold;' }, _('주석')),
						E('input', { 
							'type': 'text', 
							'placeholder': _('주석을 입력하세요'), 
							'style': 'width: 300px;',
							'data-uci': 'comment',
							'change': function() { 
								console.log('comment changed:', this.value);
								if (!self.currentRuleSection) {
									self.currentRuleSection = uci.add('firewall', 'rule');
									console.log('Created new rule section:', self.currentRuleSection);
								}
								self.registerFormChanges(self.formMap);
							}
						})
					])
				])
			])
		]);
		
		// 탭 전환 함수를 전역으로 등록
		window.switchTab = function(tabId) {
			console.log('Switching to tab:', tabId);
			
			// 모든 탭 비활성화
			var tabs = container.querySelectorAll('.control-tab');
			var contents = container.querySelectorAll('.control-content');
			
			tabs.forEach(function(tab) {
				tab.classList.remove('active');
			});
			contents.forEach(function(content) {
				content.classList.remove('active');
			});
			
			// 선택된 탭 활성화
			var selectedTab = container.querySelector('[data-tab="' + tabId + '"]');
			var selectedContent = container.querySelector('#' + tabId);
			
			if (selectedTab) selectedTab.classList.add('active');
			if (selectedContent) selectedContent.classList.add('active');
		};

		// Form Map 참조 저장
		this.formMap = m;
		
		// UCI 연결 기능 초기화
		this.initRuleConfigBindings();
		
		// Form Map의 변경 감지 시스템과 통합
		var self = this;
		
		// Form의 checkChanges 함수를 오버라이드하여 Rule Config 변경사항도 체크
		var originalCheckChanges = m.checkChanges;
		m.checkChanges = function() {
			console.log('checkChanges called');
			
			// 원본 변경사항 체크
			var hasOriginalChanges = originalCheckChanges ? originalCheckChanges.call(this) : false;
			
			// Rule Config 변경사항 체크
			var hasRuleConfigChanges = false;
			if (self.currentRuleSection) {
				var container = document.getElementById('rule-config');
				if (container) {
					// 간단한 변경사항 체크 (체크박스, 선택값 등)
					hasRuleConfigChanges = container.querySelector('input:checked') || 
						container.querySelector('select option:selected:not([value=""])');
				}
			}
			
			console.log('Original changes:', hasOriginalChanges, 'Rule Config changes:', hasRuleConfigChanges);
			return hasOriginalChanges || hasRuleConfigChanges;
		};
		
		// handleSave를 오버라이드하여 Rule Config 저장 포함
		var originalHandleSave = m.handleSave;
		m.handleSave = function() {
			console.log('handleSave called');
			
			// Rule Config 변경사항이 있으면 먼저 저장
			if (self.currentRuleSection) {
				console.log('Saving Rule Config changes first');
				return self.saveRuleConfig().then(function() {
					console.log('Rule Config saved, calling original handleSave');
					return originalHandleSave.call(this);
				}.bind(this));
			}
			
			console.log('No Rule Config changes, calling original handleSave');
			return originalHandleSave.call(this);
		};
		
		// Traffic rules 비동기 렌더링
		m.render().then(function(rulesHTML) {
			console.log('Traffic rules rendered, updating container');
			trafficRuleContainer.innerHTML = '';
			trafficRuleContainer.appendChild(rulesHTML);
		}).catch(function(err) {
			console.error('Error rendering traffic rules:', err);
			trafficRuleContainer.innerHTML = '<p style="color: red;">Error loading traffic rules</p>';
		});
		
		// 호스트 정보 로드 후 IP 카테고리 및 인터페이스 정보 적용
		setTimeout(function() {
			if (hosts) {
				var ipCategories = self.categorizeIPAddresses(hosts);
				self.applyIPCategoriesToUI(ipCategories);
				console.log('IP categories applied:', ipCategories);
				
				// 네트워크 인터페이스 정보 수집 및 적용
				self.currentNetworkInterfaces = self.collectNetworkInterfaces(hosts);
				self.updateInterfaceDropdown();
				console.log('Network interfaces applied:', self.currentNetworkInterfaces);
			}
		}, 100);
		
		return container;
	}
});