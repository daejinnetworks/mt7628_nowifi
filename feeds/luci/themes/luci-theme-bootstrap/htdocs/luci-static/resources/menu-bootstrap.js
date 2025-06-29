'use strict';
'require baseclass';
'require ui';

return baseclass.extend({
	__init__: function() {
		ui.menu.load().then(L.bind(this.render, this));
	},

	render: function(tree) {
		var node = tree,
		    url = '';

		this.renderModeMenu(tree);

		if (L.env.dispatchpath.length >= 3) {
			for (var i = 0; i < 3 && node; i++) {
				node = node.children[L.env.dispatchpath[i]];
				url = url + (url ? '/' : '') + L.env.dispatchpath[i];
			}

			if (node)
				this.renderTabMenu(node, url);
		}
	},

	renderTabMenu: function(tree, url, level) {
		var container = document.querySelector('#tabmenu'),
		    ul = E('ul', { 'class': 'tabs' }),
		    children = ui.menu.getChildren(tree),
		    activeNode = null;

		for (var i = 0; i < children.length; i++) {
			var isActive = (L.env.dispatchpath[3 + (level || 0)] == children[i].name),
			    activeClass = isActive ? ' active' : '',
			    className = 'tabmenu-item-%s %s'.format(children[i].name, activeClass);

			ul.appendChild(E('li', { 'class': className }, [
				E('a', { 'href': L.url(url, children[i].name) }, [ _(children[i].title) ] )]));

			if (isActive)
				activeNode = children[i];
		}

		if (ul.children.length == 0)
			return E([]);

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);

		return ul;
	},

	renderMainMenu: function(tree, url, level) {
		var ul = level ? E('ul', { 'class': 'dropdown-menu' }) : document.querySelector('#topmenu'),
		    children = ui.menu.getChildren(tree);

		if (!level) console.log('Top menu children:', children.map(c => c.name));

		if (children.length == 0 || level > 1)
			return E([]);

		// For top-level menu, move 'logout' to the end
		var topLevel = !level;
		var childrenCopy = children.slice();
		if (topLevel) {
			var logoutIdx = childrenCopy.findIndex(function(item) { return item.name === 'logout'; });
			var logoutItem = logoutIdx !== -1 ? childrenCopy.splice(logoutIdx, 1)[0] : null;
			var adminIdx = childrenCopy.findIndex(function(item) { return item.name === 'admin' || item.name === 'administrator'; });
			var adminItem = adminIdx !== -1 ? childrenCopy.splice(adminIdx, 1)[0] : null;
		}

		if (topLevel) {
			// 1. Render all other menu items
			for (var i = 0; i < childrenCopy.length; i++) {
				var submenu = this.renderMainMenu(childrenCopy[i], url + '/' + childrenCopy[i].name, (level || 0) + 1),
					subclass = (!level && submenu.firstElementChild) ? 'dropdown' : null,
					linkclass = (!level && submenu.firstElementChild) ? 'menu' : null,
					linkurl = submenu.firstElementChild ? '#' : L.url(url, childrenCopy[i].name);

				var linkChildren = [];
				if (childrenCopy[i].name === 'network') {
					linkChildren.push('🌐 ');
				}
				if (childrenCopy[i].name === 'system') {
					linkChildren.push('🖥️ ');
				}
				if (childrenCopy[i].name === 'vpn') {
					linkChildren.push('🔐 ');
				}
				if (childrenCopy[i].name === 'firewall') {
					linkChildren.push('🛡️ ');
				}
				if (childrenCopy[i].name === 'advanced') {
					linkChildren.push('⚙️ ');
				}
				linkChildren.push(_(childrenCopy[i].title));

				var li = E('li', { 'class': subclass }, [
					E('a', { 'class': linkclass, 'href': linkurl }, linkChildren),
					submenu
				]);
				ul.appendChild(li);
			}

			// 2. Add blank items to make total 5 (admin and logout will be 6th and 7th)
			var menuCount = childrenCopy.length;
			for (var j = menuCount; j < 5; j++) {
				ul.appendChild(E('li', { style: 'width: 100px; min-width: 100px; max-width: 100px;' }, ['\u00A0']));
			}

			// 3. Render 'administrator' as 6th
			if (adminItem) {
				var submenu = this.renderMainMenu(adminItem, url + '/' + adminItem.name, (level || 0) + 1),
					subclass = (!level && submenu.firstElementChild) ? 'dropdown' : null,
					linkclass = (!level && submenu.firstElementChild) ? 'menu' : null,
					linkurl = submenu.firstElementChild ? '#' : L.url(url, adminItem.name);

				var linkChildren = [];
				linkChildren.push('👤 ');
				linkChildren.push(_(adminItem.title)); // Default title first

				// Create the link element
				var adminLink = E('a', { 'class': linkclass, 'href': linkurl }, linkChildren);

				var li = E('li', { 'class': subclass }, [
					adminLink,
					submenu
				]);

				// Get username from session via ubus call and update the link directly
				if (L.env.sessionid) {
					var rpcData = {
						'jsonrpc': '2.0',
						'id': 1,
						'method': 'call',
						'params': [L.env.sessionid, 'session', 'get', {}]
					};

					fetch('/ubus', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
						},
						body: JSON.stringify(rpcData)
					}).then(function(response) {
						return response.json();
					}).then(function(data) {
						if (data.result && data.result[1] && data.result[1].values) {
							var username = data.result[1].values.username || _(adminItem.title);

							// Update the link element directly
							adminLink.innerHTML = '';
							adminLink.appendChild(document.createTextNode('👤 ' + username));
						}
					}).catch(function(error) {
						// Keep default title on error
						console.log('Failed to get username:', error);
					});
				}
				ul.appendChild(li);
			}

			// 4. Render 'logout' as 7th
			if (logoutItem) {
				var submenu = this.renderMainMenu(logoutItem, url + '/' + logoutItem.name, (level || 0) + 1),
					subclass = (!level && submenu.firstElementChild) ? 'dropdown' : null,
					linkclass = (!level && submenu.firstElementChild) ? 'menu' : null,
					linkurl = submenu.firstElementChild ? '#' : L.url(url, logoutItem.name);

				var linkChildren = [];
				linkChildren.push(
					E('img', {
						src: '/luci-static/bootstrap/logout_custom.png',
						alt: 'logout',
						style: 'height:18px;width:auto;margin-right:6px;vertical-align:middle;'
					})
				);
				linkChildren.push(_(logoutItem.title));

				var li = E('li', { 'class': subclass }, [
					E('a', { 'class': linkclass, 'href': linkurl }, linkChildren),
					submenu
				]);
				ul.appendChild(li);
			}
		} else {
			// Not top level: render as before
			for (var i = 0; i < childrenCopy.length; i++) {
				var submenu = this.renderMainMenu(childrenCopy[i], url + '/' + childrenCopy[i].name, (level || 0) + 1),
					subclass = (!level && submenu.firstElementChild) ? 'dropdown' : null,
					linkclass = (!level && submenu.firstElementChild) ? 'menu' : null,
					linkurl = submenu.firstElementChild ? '#' : L.url(url, childrenCopy[i].name);

				var linkChildren = [];
				linkChildren.push(_(childrenCopy[i].title));

				var li = E('li', { 'class': subclass }, [
					E('a', { 'class': linkclass, 'href': linkurl }, linkChildren),
					submenu
				]);
				ul.appendChild(li);
			}
		}

		ul.style.display = '';
		return ul;
	},

	renderModeMenu: function(tree) {
		var ul = document.querySelector('#modemenu'),
		    children = ui.menu.getChildren(tree);

		for (var i = 0; i < children.length; i++) {
			var isActive = (L.env.requestpath.length ? children[i].name == L.env.requestpath[0] : i == 0);

			ul.appendChild(E('li', { 'class': isActive ? 'active' : null }, [
				E('a', { 'href': L.url(children[i].name) }, [ _(children[i].title) ])
			]));

			if (isActive)
				this.renderMainMenu(children[i], children[i].name);
		}

		if (ul.children.length > 1)
			ul.style.display = '';
	}
});
