'use strict';

const obsidian = require('obsidian');

// Define the structure of a contact
class Contact {
    constructor(id, name) {
        this.id = id;
        this.name = name || '';
        this.email = '';
        this.phone = '';
        this.company = '';
        this.title = '';
        this.notes = '';
        this.links = [];
        this.tags = [];
        this.created = Date.now();
        this.modified = Date.now();
    }
}

// Plugin settings
class ContactsPluginSettings {
    constructor() {
        this.contactsFolder = 'Contacts';
        this.defaultContactTemplate = `---
contact: true
name: {{name}}
email: {{email}}
phone: {{phone}}
company: {{company}}
title: {{title}}
tags: {{tags}}
links: {{links_array}}
---

# {{name}}

## Contact Information
- Email: {{email}}
- Phone: {{phone}}
- Company: {{company}}
- Title: {{title}}

## Notes
{{notes}}

## Linked Files
{{links}}`;
        this.enableRibbonIcon = true;
        this.graphSettings = {
            nodeSize: 8,
            contactNodeColor: '#5c7cfa',
            fileNodeColor: '#82c91e',
            linkStrength: 30,
            repelForce: 200,
            centerForce: 0.3
        };
    }
}

// View for contacts graph visualization
class ContactsGraphView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.containerEl.addClass('contacts-graph-view');
        
        // Store graph data
        this.nodes = [];
        this.links = [];
        this.simulation = null;
        this.svg = null;
        this.zoom = null;
        
        // Track if the simulation is initialized
        this.isSimulationInitialized = false;
    }

    getViewType() {
        return 'contacts-graph-view';
    }

    getDisplayText() {
        return 'Contacts Graph';
    }

    getIcon() {
        return 'dot-network';
    }

    async onOpen() {
        await this.initializeView();
    }
    
    async onResize() {
        if (this.svg) {
            const width = this.contentEl.clientWidth;
            const height = this.contentEl.clientHeight;
            this.svg
                .attr('width', width)
                .attr('height', height);
                
            // Recenter the simulation if it exists
            if (this.simulation) {
                this.simulation
                    .force('center', d3.forceCenter(width / 2, height / 2));
                this.simulation.alpha(0.3).restart();
            }
        }
    }
    
    async onClose() {
        if (this.simulation) {
            this.simulation.stop();
        }
    }

    async initializeView() {
        this.contentEl.empty();
        this.contentEl.createEl('div', { cls: 'graph-loading', text: 'Loading graph...' });
        
        try {
            // Load D3.js from CDN
            await this.loadD3();
            
            // Prepare the container
            this.contentEl.empty();
            const graphContainer = this.contentEl.createEl('div', { cls: 'graph-container' });
            
            // Create controls
            this.createGraphControls(graphContainer);
            
            // Create the SVG container for the graph
            const width = this.contentEl.clientWidth;
            const height = this.contentEl.clientHeight - 40; // account for controls
            
            this.svg = d3.select(graphContainer)
                .append('svg')
                .attr('width', width)
                .attr('height', height)
                .attr('class', 'contacts-graph-svg');
                
            // Add zoom behavior
            this.zoom = d3.zoom()
                .scaleExtent([0.1, 8])
                .on('zoom', (event) => {
                    this.svg.select('g').attr('transform', event.transform);
                });
                
            this.svg.call(this.zoom);
            
            // Create a group for the graph elements
            const g = this.svg.append('g');
            
            // Add graph legend
            this.addGraphLegend(g);
            
            // Load and render the graph data
            await this.loadGraphData();
            this.renderGraph();
            
        } catch (error) {
            console.error('Error initializing contacts graph view:', error);
            this.contentEl.empty();
            this.contentEl.createEl('div', { 
                cls: 'graph-error', 
                text: 'Error loading graph visualization. Check console for details.' 
            });
        }
    }
    
    createGraphControls(container) {
        const controlsContainer = container.createEl('div', { cls: 'graph-controls' });
        
        // Refresh button
        const refreshBtn = controlsContainer.createEl('button', {
            cls: 'graph-control-btn',
            text: 'Refresh Graph'
        });
        refreshBtn.addEventListener('click', async () => {
            await this.loadGraphData();
            this.renderGraph();
        });
        
        // Open in Obsidian Graph button
        const obsidianGraphBtn = controlsContainer.createEl('button', {
            cls: 'graph-control-btn',
            text: 'Open in Obsidian Graph'
        });
        obsidianGraphBtn.addEventListener('click', () => {
            this.openInObsidianGraph();
        });
        
        // Search box
        const searchContainer = controlsContainer.createEl('div', { cls: 'graph-search-container' });
        const searchInput = searchContainer.createEl('input', {
            cls: 'graph-search-input',
            type: 'text',
            placeholder: 'Search nodes...'
        });
        
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            this.highlightSearchResults(searchTerm);
        });
    }
    
    highlightSearchResults(searchTerm) {
        if (!this.svg) return;
        
        if (!searchTerm) {
            // Reset all nodes
            this.svg.selectAll('.node-circle')
                .attr('r', d => this.getNodeSize(d))
                .attr('fill-opacity', 1)
                .attr('stroke-width', 1.5);
                
            this.svg.selectAll('.node-label')
                .attr('font-weight', 'normal')
                .attr('font-size', '12px');
                
            this.svg.selectAll('.link')
                .attr('stroke-opacity', 0.6);
                
            return;
        }
        
        // Get matching nodes
        const matchingNodes = this.nodes.filter(node => 
            node.name.toLowerCase().includes(searchTerm));
            
        const matchingNodeIds = new Set(matchingNodes.map(node => node.id));
        
        // Highlight matching nodes and their connections
        this.svg.selectAll('.node-circle')
            .attr('r', d => matchingNodeIds.has(d.id) ? this.getNodeSize(d) * 1.5 : this.getNodeSize(d))
            .attr('fill-opacity', d => matchingNodeIds.has(d.id) ? 1 : 0.3)
            .attr('stroke-width', d => matchingNodeIds.has(d.id) ? 3 : 1.5);
            
        this.svg.selectAll('.node-label')
            .attr('font-weight', d => matchingNodeIds.has(d.id) ? 'bold' : 'normal')
            .attr('font-size', d => matchingNodeIds.has(d.id) ? '14px' : '12px');
            
        // Highlight links connected to matching nodes
        this.svg.selectAll('.link')
            .attr('stroke-opacity', d => 
                matchingNodeIds.has(d.source.id) || matchingNodeIds.has(d.target.id) ? 1 : 0.1);
    }
    
    addGraphLegend(g) {
        const legend = g.append('g')
            .attr('class', 'graph-legend')
            .attr('transform', 'translate(20, 20)');
            
        // Contact node
        legend.append('circle')
            .attr('cx', 10)
            .attr('cy', 10)
            .attr('r', 8)
            .attr('fill', this.plugin.settings.graphSettings.contactNodeColor);
            
        legend.append('text')
            .attr('x', 25)
            .attr('y', 15)
            .text('Contact');
            
        // File node
        legend.append('circle')
            .attr('cx', 10)
            .attr('cy', 40)
            .attr('r', 8)
            .attr('fill', this.plugin.settings.graphSettings.fileNodeColor);
            
        legend.append('text')
            .attr('x', 25)
            .attr('y', 45)
            .text('Linked File');
    }
    
    // Load D3.js library dynamically
    async loadD3() {
        // Check if D3 is already loaded
        if (window.d3) return;
        
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load D3.js'));
            document.head.appendChild(script);
        });
    }
    
    // Load graph data (contacts and their links)
    async loadGraphData() {
        this.nodes = [];
        this.links = [];
        
        try {
            // Get all contacts
            const contacts = await this.plugin.getContacts();
            
            // Create nodes for contacts
            for (const contact of contacts) {
                this.nodes.push({
                    id: `contact-${contact.id}`,
                    name: contact.name,
                    type: 'contact',
                    contact: contact
                });
                
                // Create nodes for linked files and edges
                if (contact.links && contact.links.length > 0) {
                    for (const linkName of contact.links) {
                        // Check if file node already exists
                        const fileNodeId = `file-${linkName}`;
                        if (!this.nodes.some(n => n.id === fileNodeId)) {
                            this.nodes.push({
                                id: fileNodeId,
                                name: linkName,
                                type: 'file',
                                fileName: linkName
                            });
                        }
                        
                        // Add a link between contact and file
                        this.links.push({
                            source: `contact-${contact.id}`,
                            target: fileNodeId
                        });
                    }
                }
            }
            
            // Look for connections between contacts (files that link to multiple contacts)
            const fileToContacts = {};
            for (const link of this.links) {
                const targetId = link.target;
                if (targetId.startsWith('file-')) {
                    if (!fileToContacts[targetId]) {
                        fileToContacts[targetId] = [];
                    }
                    fileToContacts[targetId].push(link.source);
                }
            }
            
            // Add implied links between contacts that share files
            for (const fileId in fileToContacts) {
                const connectedContacts = fileToContacts[fileId];
                if (connectedContacts.length > 1) {
                    // Add links between all pairs of contacts
                    for (let i = 0; i < connectedContacts.length; i++) {
                        for (let j = i + 1; j < connectedContacts.length; j++) {
                            this.links.push({
                                source: connectedContacts[i],
                                target: connectedContacts[j],
                                type: 'implied',
                                strength: 0.5 // weaker than direct links
                            });
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error('Error loading graph data:', error);
        }
    }
    
    getNodeSize(node) {
        const baseSize = this.plugin.settings.graphSettings.nodeSize;
        if (node.type === 'contact') {
            // Make size proportional to number of links
            const linkedFiles = this.links.filter(link => 
                link.source.id === node.id || 
                (typeof link.source === 'string' && link.source === node.id));
                
            return baseSize + Math.sqrt(linkedFiles.length * 2);
        }
        return baseSize;
    }
    
    getNodeColor(node) {
        if (node.type === 'contact') {
            return this.plugin.settings.graphSettings.contactNodeColor;
        } else {
            return this.plugin.settings.graphSettings.fileNodeColor;
        }
    }
    
    // Render the graph using D3.js
    renderGraph() {
        if (!window.d3 || !this.svg) return;
        
        // Clear existing graph
        this.svg.select('g').selectAll('*').remove();
        
        const g = this.svg.select('g');
        const width = this.contentEl.clientWidth;
        const height = this.contentEl.clientHeight - 40; // account for controls
        
        // Re-add the legend
        this.addGraphLegend(g);
        
        // Check if we have data
        if (this.nodes.length === 0) {
            g.append('text')
                .attr('x', width / 2)
                .attr('y', height / 2)
                .attr('text-anchor', 'middle')
                .text('No contacts found. Create some contacts first!');
            return;
        }
        
        // Create the simulation
        if (this.simulation) {
            this.simulation.stop();
        }
        
        // Convert node IDs to node objects in links
        const links = this.links.map(link => {
            return {
                source: typeof link.source === 'string' ? 
                    this.nodes.find(n => n.id === link.source) : link.source,
                target: typeof link.target === 'string' ? 
                    this.nodes.find(n => n.id === link.target) : link.target,
                type: link.type || 'direct',
                strength: link.strength || 1
            };
        }).filter(link => link.source && link.target); // Filter out invalid links
        
        // Create force simulation
        this.simulation = d3.forceSimulation(this.nodes)
            .force('link', d3.forceLink(links)
                .id(d => d.id)
                .distance(d => d.type === 'implied' ? 150 : 100)
                .strength(d => d.strength * (this.plugin.settings.graphSettings.linkStrength / 100)))
            .force('charge', d3.forceManyBody()
                .strength(-this.plugin.settings.graphSettings.repelForce))
            .force('center', d3.forceCenter(width / 2, height / 2)
                .strength(this.plugin.settings.graphSettings.centerForce / 10))
            .force('collision', d3.forceCollide().radius(d => this.getNodeSize(d) + 10))
            .on('tick', ticked);
            
        // Create the links
        const link = g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(links)
            .enter().append('line')
            .attr('class', 'link')
            .attr('stroke', d => d.type === 'implied' ? '#ccc' : '#999')
            .attr('stroke-opacity', d => d.type === 'implied' ? 0.3 : 0.6)
            .attr('stroke-width', d => d.type === 'implied' ? 1 : 2)
            .attr('stroke-dasharray', d => d.type === 'implied' ? '3,3' : null);
            
        // Create a group for each node
        const node = g.append('g')
            .attr('class', 'nodes')
            .selectAll('.node')
            .data(this.nodes)
            .enter().append('g')
            .attr('class', 'node')
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended));
                
        // Add circles to the nodes
        node.append('circle')
            .attr('class', 'node-circle')
            .attr('r', d => this.getNodeSize(d))
            .attr('fill', d => this.getNodeColor(d))
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5);
            
        // Add labels to the nodes
        node.append('text')
            .attr('class', 'node-label')
            .attr('dx', d => this.getNodeSize(d) + 5)
            .attr('dy', '.35em')
            .text(d => d.name)
            .attr('font-size', '12px');
            
        // Add tooltips
        node.append('title')
            .text(d => {
                if (d.type === 'contact') {
                    let tooltip = `Contact: ${d.name}`;
                    if (d.contact.email) tooltip += `\nEmail: ${d.contact.email}`;
                    if (d.contact.phone) tooltip += `\nPhone: ${d.contact.phone}`;
                    return tooltip;
                } else {
                    return `File: ${d.name}`;
                }
            });
            
        // Add click handlers
        node.on('click', (event, d) => {
            if (d.type === 'contact') {
                // Open contact file
                const contactFile = this.plugin.getContactFile(d.contact.id);
                if (contactFile) {
                    this.plugin.app.workspace.getLeaf().openFile(contactFile);
                }
            } else if (d.type === 'file') {
                // Open linked file
                const file = this.plugin.getFileByName(d.fileName);
                if (file) {
                    this.plugin.app.workspace.getLeaf().openFile(file);
                } else {
                    new obsidian.Notice(`File '${d.fileName}' not found.`);
                }
            }
        });
            
        // Update positions on simulation tick
        function ticked() {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
                
            node
                .attr('transform', d => `translate(${d.x},${d.y})`);
        }
        
        // Drag functions
        const simulation = this.simulation;
        
        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        
        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
        
        // Center and fit the graph initially
        this.centerGraph();
        
        this.isSimulationInitialized = true;
    }
    
    centerGraph() {
        if (!this.svg || !this.zoom) return;
        
        const svg = this.svg.node();
        const width = svg.clientWidth;
        const height = svg.clientHeight;
        
        // Reset zoom and center
        this.svg.transition().duration(750).call(
            this.zoom.transform,
            d3.zoomIdentity
                .translate(width / 2, height / 2)
                .scale(0.8)
                .translate(-width / 2, -height / 2)
        );
    }
    
    openInObsidianGraph() {
        // Get all contact files
        const contactIds = this.nodes
            .filter(node => node.type === 'contact')
            .map(node => node.contact.id);
            
        // Prepare a graph search query to focus on contacts
        let searchQuery = `path:${this.plugin.settings.contactsFolder}`;
        
        // Try to open the graph view with the search filter
        try {
            // First get any existing graph leaf
            const graphLeaves = this.plugin.app.workspace.getLeavesOfType("graph");
            let leaf;
            
            if (graphLeaves.length > 0) {
                leaf = graphLeaves[0];
            } else {
                // Create a new leaf for the graph
                leaf = this.plugin.app.workspace.getRightLeaf(false);
            }
            
            // Open graph view with our search query
            leaf.setViewState({
                type: "graph",
                state: { query: searchQuery }
            });
            
            // Reveal the leaf
            this.plugin.app.workspace.revealLeaf(leaf);
            
            // Notify the user
            new obsidian.Notice("Opened contacts in Obsidian Graph View");
        } catch (error) {
            console.error("Error opening Obsidian Graph View:", error);
            new obsidian.Notice("Failed to open Obsidian Graph View");
        }
    }
}

// View for contacts network
class ContactsNetworkView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.containerEl.addClass('contacts-network-view');
    }

    getViewType() {
        return 'contacts-network-view';
    }

    getDisplayText() {
        return 'Contacts Network';
    }

    getIcon() {
        return 'address-book';
    }

    async onOpen() {
        await this.render();
    }

    async render() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Contacts Network' });
        
        // Create a container for the network visualization
        const networkContainer = contentEl.createEl('div', { 
            cls: 'contacts-network-container' 
        });

        // Create a container for contact details
        const detailsContainer = contentEl.createEl('div', {
            cls: 'contacts-details-container'
        });
        
        // Load and render contacts
        const contacts = await this.plugin.getContacts();
        
        if (contacts.length === 0) {
            networkContainer.createEl('p', { 
                text: 'No contacts found. Create some contacts first!' 
            });
            return;
        }

        // Create a node for each contact
        const contactsListEl = networkContainer.createEl('div', { 
            cls: 'contacts-list' 
        });
        
        for (const contact of contacts) {
            // Create contact node
            const contactEl = contactsListEl.createEl('div', {
                cls: 'contact-node',
                attr: {
                    'data-contact-id': contact.id
                }
            });
            
            // Create contact card
            const cardEl = contactEl.createEl('div', { 
                cls: 'contact-card' 
            });
            
            cardEl.createEl('h3', { text: contact.name });
            
            const detailsEl = cardEl.createEl('div', { 
                cls: 'contact-details' 
            });
            
            if (contact.email) {
                const row = detailsEl.createEl('div');
                row.createEl('span', { text: 'Email:', cls: 'label' });
                row.createEl('span', { text: contact.email });
            }
            
            if (contact.phone) {
                const row = detailsEl.createEl('div');
                row.createEl('span', { text: 'Phone:', cls: 'label' });
                row.createEl('span', { text: contact.phone });
            }
            
            if (contact.links && contact.links.length > 0) {
                // Create links section
                const linksEl = cardEl.createEl('div', { 
                    cls: 'contact-links',
                    text: 'Linked Files:'
                });
                
                const linksList = linksEl.createEl('ul');
                
                for (const link of contact.links) {
                    const linkItemEl = linksList.createEl('li');
                    
                    // Create a link to the file
                    const linkAnchor = linkItemEl.createEl('a', {
                        cls: 'internal-link',
                        text: link,
                        attr: {
                            'data-file-path': link,
                            'href': '#'
                        }
                    });
                    
                    // Handle click on link - open the file
                    linkAnchor.addEventListener('click', (event) => {
                        event.preventDefault();
                        
                        // Find the file in the vault
                        const file = this.plugin.getFileByName(link);
                        if (file) {
                            // Open the file in a new leaf
                            this.plugin.app.workspace.getLeaf().openFile(file);
                        } else {
                            new obsidian.Notice(`File '${link}' not found.`);
                        }
                    });
                }
            }
            
            // Add click handler to show contact details
            cardEl.addEventListener('click', () => {
                // Update details pane
                this.renderContactDetails(contact, detailsContainer);
                
                // Highlight selected contact
                document.querySelectorAll('.contact-node').forEach(el => {
                    el.removeClass('selected');
                });
                contactEl.addClass('selected');
            });
        }
    }
    
    renderContactDetails(contact, containerEl) {
        containerEl.empty();
        
        containerEl.createEl('h3', { text: contact.name });
        
        const detailsEl = containerEl.createEl('div', { 
            cls: 'contact-details-full' 
        });
        
        // Basic details
        const addDetail = (label, value) => {
            if (value) {
                const row = detailsEl.createEl('div', { cls: 'detail-row' });
                row.createEl('div', { text: label, cls: 'detail-label' });
                row.createEl('div', { text: value, cls: 'detail-value' });
            }
        };
        
        addDetail('Email', contact.email);
        addDetail('Phone', contact.phone);
        addDetail('Company', contact.company);
        addDetail('Title', contact.title);
        
        // Tags
        if (contact.tags && contact.tags.length > 0) {
            const tagsRow = detailsEl.createEl('div', { cls: 'detail-row' });
            tagsRow.createEl('div', { text: 'Tags', cls: 'detail-label' });
            
            const tagsEl = tagsRow.createEl('div', { cls: 'detail-value' });
            const tagsContainer = tagsEl.createEl('div', { cls: 'tags-container' });
            
            for (const tag of contact.tags) {
                tagsContainer.createEl('span', { 
                    text: tag,
                    cls: 'tag'
                });
            }
        }
        
        // Notes
        if (contact.notes) {
            detailsEl.createEl('div', { 
                text: 'Notes',
                cls: 'detail-section-title'
            });
            
            detailsEl.createEl('div', { 
                text: contact.notes,
                cls: 'detail-notes'
            });
        }
        
        // Linked files
        if (contact.links && contact.links.length > 0) {
            detailsEl.createEl('div', { 
                text: 'Linked Files',
                cls: 'detail-section-title'
            });
            
            const linksContainer = detailsEl.createEl('div', { 
                cls: 'detail-links' 
            });
            
            for (const link of contact.links) {
                const linkEl = linksContainer.createEl('div', { 
                    cls: 'detail-link' 
                });
                
                const linkText = linkEl.createEl('a', {
                    text: link,
                    cls: 'link-text',
                    attr: { 'href': '#' }
                });
                
                linkText.addEventListener('click', (event) => {
                    event.preventDefault();
                    
                    // Find the file in the vault
                    const file = this.plugin.getFileByName(link);
                    if (file) {
                        // Open the file
                        this.plugin.app.workspace.getLeaf().openFile(file);
                    } else {
                        new obsidian.Notice(`File '${link}' not found.`);
                    }
                });
            }
        }
        
        // Action buttons
        const actionsEl = containerEl.createEl('div', { 
            cls: 'contact-actions' 
        });
        
        // Edit contact button
        const editButton = actionsEl.createEl('button', {
            text: 'Edit Contact',
            cls: 'mod-cta'
        });
        
        editButton.addEventListener('click', () => {
            // Find the contact file
            const contactFile = this.plugin.getContactFile(contact.id);
            if (contactFile) {
                // Open the file for editing
                this.plugin.app.workspace.getLeaf().openFile(contactFile);
            }
        });
        
        // Link new file button
        const linkButton = actionsEl.createEl('button', {
            text: 'Link New File'
        });
        
        linkButton.addEventListener('click', () => {
            // Open file selector
            this.plugin.selectFileToLink(contact.id);
        });
    }
}

class ContactsPlugin extends obsidian.Plugin {
    async onload() {
        console.log('Loading Contacts plugin');
        
        // Load settings
        await this.loadSettings();
        
        // Register the custom views
        this.registerView(
            'contacts-network-view',
            (leaf) => new ContactsNetworkView(leaf, this)
        );
        
        this.registerView(
            'contacts-graph-view',
            (leaf) => new ContactsGraphView(leaf, this)
        );
        
        // Add a ribbon icon for the network view
        this.addRibbonIcon('network', 'Open Contacts Network', () => {
            this.activateView('contacts-network-view');
        });
        
        // Add a ribbon icon for the graph view
        this.addRibbonIcon('dot-network', 'Open Contacts Graph', () => {
            this.activateView('contacts-graph-view');
        });
        
        // Add ribbon icon for creating new contact
        if (this.settings.enableRibbonIcon) {
            this.addRibbonIcon('address-book', 'Create New Contact', () => {
                this.createContactModal();
            });
        }
        
        // Add a command to open the network view
        this.addCommand({
            id: 'open-contacts-network',
            name: 'Open Contacts Network',
            callback: () => {
                this.activateView('contacts-network-view');
            }
        });
        
        // Add a command to open the graph view
        this.addCommand({
            id: 'open-contacts-graph',
            name: 'Open Contacts Graph',
            callback: () => {
                this.activateView('contacts-graph-view');
            }
        });
        
        // Add a command to create a new contact
        this.addCommand({
            id: 'create-contact',
            name: 'Create New Contact',
            callback: () => {
                this.createContactModal();
            }
        });
        
        // Add a command to link current file to a contact
        this.addCommand({
            id: 'link-to-contact',
            name: 'Link Current File to Contact',
            editorCheckCallback: (checking, editor, view) => {
                // Check if we're in a markdown view
                if (!view || !view.file) return false;
                
                if (!checking) {
                    this.linkToContactModal(view.file);
                }
                
                return true;
            }
        });
        
        // Add a command to filter Obsidian's Graph View to show contacts
        this.addCommand({
            id: 'filter-obsidian-graph',
            name: 'Filter Obsidian Graph to Contacts',
            callback: () => {
                this.filterObsidianGraph();
            }
        });
        
        // Register context menu for files - to link to contacts
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                menu.addItem((item) => {
                    item
                        .setTitle('Link to Contact')
                        .setIcon('link')
                        .onClick(() => {
                            this.linkToContactModal(file);
                        });
                });
            })
        );
        
        // Add settings tab
        this.addSettingTab(new ContactsSettingTab(this.app, this));
        
        // Make sure contacts folder exists
        this.ensureContactsFolder();
    }
    
    onunload() {
        console.log('Unloading Contacts plugin');
        this.app.workspace.detachLeavesOfType('contacts-network-view');
        this.app.workspace.detachLeavesOfType('contacts-graph-view');
    }
    
    async loadSettings() {
        this.settings = Object.assign(new ContactsPluginSettings(), await this.loadData());
    }
    
    async saveSettings() {
        await this.saveData(this.settings);
    }
    
    // Activate a specific view type
    async activateView(viewType) {
        const { workspace } = this.app;
        
        // Check if view is already open
        const leaves = workspace.getLeavesOfType(viewType);
        if (leaves.length > 0) {
            // Focus existing leaf
            workspace.revealLeaf(leaves[0]);
            return;
        }
        
        // Open in a new leaf
        const leaf = workspace.getRightLeaf(false);
        await leaf.setViewState({
            type: viewType,
            active: true
        });
        
        workspace.revealLeaf(leaf);
    }
    
    // Filter Obsidian's native graph view to show contacts
    filterObsidianGraph() {
        try {
            // Prepare a graph search query to focus on contacts
            let searchQuery = `path:${this.settings.contactsFolder}`;
            
            // Try to open the graph view with the search filter
            const graphLeaves = this.app.workspace.getLeavesOfType("graph");
            let leaf;
            
            if (graphLeaves.length > 0) {
                leaf = graphLeaves[0];
            } else {
                // Create a new leaf for the graph
                leaf = this.app.workspace.getRightLeaf(false);
            }
            
            // Open graph view with our search query
            leaf.setViewState({
                type: "graph",
                state: { query: searchQuery }
            });
            
            // Reveal the leaf
            this.app.workspace.revealLeaf(leaf);
            
            // Notify the user
            new obsidian.Notice("Filtered Obsidian Graph to show contacts");
        } catch (error) {
            console.error("Error filtering Obsidian Graph View:", error);
            new obsidian.Notice("Failed to filter Obsidian Graph View");
        }
    }
    
    async ensureContactsFolder() {
        try {
            const folderPath = this.settings.contactsFolder;
            const folderExists = await this.app.vault.adapter.exists(folderPath);
            
            if (!folderExists) {
                await this.app.vault.createFolder(folderPath);
                new obsidian.Notice(`Created Contacts folder at ${folderPath}`);
            }
        } catch (error) {
            console.error('Error ensuring contacts folder exists:', error);
            new obsidian.Notice('Failed to create Contacts folder. Check console for details.');
        }
    }
    
    // Helper to get a file by name
    getFileByName(name) {
        const files = this.app.vault.getFiles();
        for (const file of files) {
            if (file.basename === name) {
                return file;
            }
        }
        return null;
    }
    
    // Helper to get a contact file
    getContactFile(contactId) {
        const contactsFolder = this.settings.contactsFolder;
        const contactFilePath = `${contactsFolder}/${contactId}.md`;
        return this.app.vault.getAbstractFileByPath(contactFilePath);
    }
    
    // Create a new contact modal
    createContactModal() {
        const modal = new obsidian.Modal(this.app);
        modal.contentEl.addClass('contacts-modal');
        
        const container = modal.contentEl;
        
        container.createEl('h2', { text: 'Create New Contact' });
        
        // Name (required)
        container.createEl('label', { text: 'Name *' });
        const nameInput = container.createEl('input', {
            type: 'text',
            placeholder: 'Full Name',
            required: true
        });
        
        container.createEl('br');
        
        // Email
        container.createEl('label', { text: 'Email' });
        const emailInput = container.createEl('input', {
            type: 'email',
            placeholder: 'Email Address'
        });
        
        container.createEl('br');
        
        // Phone
        container.createEl('label', { text: 'Phone' });
        const phoneInput = container.createEl('input', {
            type: 'tel',
            placeholder: 'Phone Number'
        });
        
        container.createEl('br');
        
        // Company
        container.createEl('label', { text: 'Company' });
        const companyInput = container.createEl('input', {
            type: 'text',
            placeholder: 'Company or Organization'
        });
        
        container.createEl('br');
        
        // Title
        container.createEl('label', { text: 'Title' });
        const titleInput = container.createEl('input', {
            type: 'text',
            placeholder: 'Job Title or Role'
        });
        
        container.createEl('br');
        
        // Tags
        container.createEl('label', { text: 'Tags' });
        const tagsInput = container.createEl('input', {
            type: 'text',
            placeholder: 'comma, separated, tags'
        });
        
        container.createEl('br');
        
        // Notes
        container.createEl('label', { text: 'Notes' });
        const notesInput = container.createEl('textarea', {
            placeholder: 'Additional notes about this contact',
            cols: 40,
            rows: 4
        });
        
        container.createEl('br');
        
        // Buttons
        const buttonContainer = container.createEl('div', {
            cls: 'button-container'
        });
        
        // Cancel button
        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel'
        });
        cancelButton.addEventListener('click', () => {
            modal.close();
        });
        
        // Create button
        const createButton = buttonContainer.createEl('button', {
            text: 'Create Contact',
            cls: 'mod-cta'
        });
        createButton.addEventListener('click', async () => {
            const name = nameInput.value;
            if (!name) {
                new obsidian.Notice('Name is required!');
                return;
            }
            
            const contactData = {
                name: name,
                email: emailInput.value,
                phone: phoneInput.value,
                company: companyInput.value,
                title: titleInput.value,
                notes: notesInput.value,
                tags: tagsInput.value ? tagsInput.value.split(',').map(tag => tag.trim()).filter(tag => tag) : []
            };
            
            await this.createContact(contactData);
            modal.close();
        });
        
        modal.open();
    }
    
    // Select file to link to a contact
    async selectFileToLink(contactId) {
        // Get all markdown files
        const files = this.app.vault.getMarkdownFiles();
        
        // Create a modal to select a file
        const modal = new obsidian.Modal(this.app);
        modal.contentEl.addClass('file-selector-modal');
        
        modal.contentEl.createEl('h2', { text: 'Select File to Link' });
        
        const filesList = modal.contentEl.createEl('div', { 
            cls: 'files-list' 
        });
        
        // Create a search input
        const searchInput = modal.contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Search files...',
            cls: 'search-input'
        });
        
        // Filter files function
        const filterFiles = (query) => {
            const normalizedQuery = query.toLowerCase();
            filesList.empty();
            
            const filteredFiles = files.filter(file => 
                file.path.toLowerCase().includes(normalizedQuery));
            
            for (const file of filteredFiles) {
                const fileItem = filesList.createEl('div', { 
                    cls: 'file-item',
                    text: file.path
                });
                
                fileItem.addEventListener('click', async () => {
                    await this.linkFileToContact(contactId, file.path);
                    modal.close();
                });
            }
        };
        
        // Initial rendering
        filterFiles('');
        
        // Search input handler
        searchInput.addEventListener('input', (e) => {
            filterFiles(e.target.value);
        });
        
        modal.open();
    }
    
    // Link to contact modal with improved UX
    async linkToContactModal(file) {
        try {
            const contacts = await this.getContacts();
            
            if (contacts.length === 0) {
                new obsidian.Notice('No contacts found. Create some contacts first!');
                return;
            }
            
            // Create a custom modal for better UX
            const modal = new obsidian.Modal(this.app);
            modal.contentEl.addClass('contacts-selector-modal');
            
            modal.contentEl.createEl('h2', { 
                text: `Link "${file.basename}" to Contact` 
            });
            
            // Add search input
            const searchInput = modal.contentEl.createEl('input', {
                type: 'text',
                placeholder: 'Search contacts...',
                cls: 'contact-search-input'
            });
            
            const contactsList = modal.contentEl.createEl('div', { 
                cls: 'contacts-selector-list' 
            });
            
            // Render contacts function
            const renderContacts = (query = '') => {
                contactsList.empty();
                
                const filteredContacts = query 
                    ? contacts.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
                    : contacts;
                
                for (const contact of filteredContacts) {
                    const contactItem = contactsList.createEl('div', { 
                        cls: 'contact-item' 
                    });
                    
                    contactItem.createEl('div', { 
                        cls: 'contact-name',
                        text: contact.name
                    });
                    
                    if (contact.email || contact.company) {
                        const detailsEl = contactItem.createEl('div', { 
                            cls: 'contact-item-details' 
                        });
                        
                        if (contact.email) {
                            detailsEl.createEl('span', { 
                                cls: 'contact-email',
                                text: contact.email
                            });
                        }
                        
                        if (contact.company) {
                            detailsEl.createEl('span', { 
                                cls: 'contact-company',
                                text: contact.company
                            });
                        }
                    }
                    
                    // Handle click to link the file to this contact
                    contactItem.addEventListener('click', async () => {
                        const success = await this.linkFileToContact(contact.id, file.path);
                        if (success) {
                            modal.close();
                        }
                    });
                }
            };
            
            // Initial rendering
            renderContacts();
            
            // Handle search input
            searchInput.addEventListener('input', (e) => {
                renderContacts(e.target.value);
            });
            
            // Focus search input when modal opens
            setTimeout(() => searchInput.focus(), 10);
            
            modal.open();
        } catch (error) {
            console.error('Error opening link to contact modal:', error);
            new obsidian.Notice('Failed to load contacts. Check console for details.');
        }
    }
    
    // Get all contacts with improved parsing
    async getContacts() {
        try {
            const contactsFolder = this.settings.contactsFolder;
            const folder = this.app.vault.getAbstractFileByPath(contactsFolder);
            
            if (!folder || !(folder instanceof obsidian.TFolder)) {
                new obsidian.Notice('Contacts folder not found. Please check settings.');
                return [];
            }
            
            const contacts = [];
            
            // Get all markdown files in the contacts folder
            for (const file of folder.children) {
                if (file instanceof obsidian.TFile && file.extension === 'md') {
                    try {
                        const content = await this.app.vault.read(file);
                        const frontmatter = this.extractFrontmatter(content);
                        
                        // Check if this is a contact file
                        if (frontmatter && frontmatter.contact === true) {
                            const contact = new Contact(file.basename, frontmatter.name || file.basename);
                            
                            contact.email = frontmatter.email || '';
                            contact.phone = frontmatter.phone || '';
                            contact.company = frontmatter.company || '';
                            contact.title = frontmatter.title || '';
                            contact.notes = frontmatter.notes || '';
                            
                            // Parse links from frontmatter and content
                            contact.links = this.extractLinks(frontmatter, content);
                            
                            // Parse tags
                            if (frontmatter.tags) {
                                if (Array.isArray(frontmatter.tags)) {
                                    contact.tags = frontmatter.tags;
                                } else if (typeof frontmatter.tags === 'string') {
                                    contact.tags = frontmatter.tags.split(',').map(tag => tag.trim());
                                }
                            } else {
                                contact.tags = [];
                            }
                            
                            contact.created = file.stat.ctime;
                            contact.modified = file.stat.mtime;
                            
                            contacts.push(contact);
                        }
                    } catch (error) {
                        console.error(`Error reading contact file ${file.path}:`, error);
                    }
                }
            }
            
            return contacts;
        } catch (error) {
            console.error('Error getting contacts:', error);
            return [];
        }
    }
    
    // Extract links from both frontmatter and content
    extractLinks(frontmatter, content) {
        const links = [];
        
        // Check frontmatter for links
        if (frontmatter.links) {
            if (Array.isArray(frontmatter.links)) {
                links.push(...frontmatter.links);
            }
        }
        
        // Extract links from content
        const linkRegex = /\[\[(.*?)(\|.*?)?\]\]/g;
        let match;
        
        while ((match = linkRegex.exec(content)) !== null) {
            const link = match[1].trim();
            if (!links.includes(link)) {
                links.push(link);
            }
        }
        
        // Look for links in the Linked Files section
        const linkedFilesRegex = /## Linked Files\n([\s\S]*?)(?=\n##|$)/;
        const linkedFilesMatch = content.match(linkedFilesRegex);
        
        if (linkedFilesMatch && linkedFilesMatch[1]) {
            const linkedFilesContent = linkedFilesMatch[1];
            const fileLinks = linkedFilesContent.match(linkRegex);
            
            if (fileLinks) {
                for (const fileLink of fileLinks) {
                    const link = fileLink.match(/\[\[(.*?)(\|.*?)?\]\]/)[1].trim();
                    if (!links.includes(link)) {
                        links.push(link);
                    }
                }
            }
        }
        
        return links;
    }
    
    // Extract frontmatter from content with improved parsing
    extractFrontmatter(content) {
        try {
            const frontmatterRegex = /---\n([\s\S]*?)\n---/;
            const match = content.match(frontmatterRegex);
            
            if (match && match[1]) {
                const frontmatter = match[1];
                const result = {};
                
                const lines = frontmatter.split('\n');
                for (const line of lines) {
                    // Skip empty lines
                    if (!line.trim()) continue;
                    
                    const colonIndex = line.indexOf(':');
                    if (colonIndex !== -1) {
                        const key = line.slice(0, colonIndex).trim();
                        let value = line.slice(colonIndex + 1).trim();
                        
                        // Parse boolean values
                        if (value === 'true') result[key] = true;
                        else if (value === 'false') result[key] = false;
                        // Parse arrays in YAML format
                        else if (value.startsWith('[') && value.endsWith(']')) {
                            try {
                                // Remove brackets and split by commas
                                value = value.slice(1, -1).trim();
                                if (value) {
                                    result[key] = value.split(',').map(v => v.trim());
                                } else {
                                    result[key] = [];
                                }
                            } catch (e) {
                                console.error('Error parsing array value:', e);
                                result[key] = value; // Keep as string if parsing fails
                            }
                        }
                        // Regular string value
                        else result[key] = value;
                    }
                }
                
                return result;
            }
        } catch (error) {
            console.error('Error extracting frontmatter:', error);
        }
        
        return null;
    }
    
    // Create a new contact with improved link handling
    async createContact(contactData) {
        try {
            await this.ensureContactsFolder();
            
            const id = this.generateContactId(contactData.name || 'Contact');
            const fileName = `${id}.md`;
            const filePath = `${this.settings.contactsFolder}/${fileName}`;
            
            // Check if file already exists
            const exists = await this.app.vault.adapter.exists(filePath);
            if (exists) {
                new obsidian.Notice(`A contact with the ID "${id}" already exists. Please use a different name.`);
                return null;
            }
            
            // Create contact content from template
            let content = this.settings.defaultContactTemplate;
            
            // Replace template variables
            content = content.replace(/{{name}}/g, contactData.name || '');
            content = content.replace(/{{email}}/g, contactData.email || '');
            content = content.replace(/{{phone}}/g, contactData.phone || '');
            content = content.replace(/{{company}}/g, contactData.company || '');
            content = content.replace(/{{title}}/g, contactData.title || '');
            content = content.replace(/{{notes}}/g, contactData.notes || '');
            
            // Handle links for frontmatter and content
            const linksArrayContent = contactData.links && contactData.links.length > 0
                ? JSON.stringify(contactData.links)
                : '[]';
                
            const linksContent = contactData.links && contactData.links.length > 0
                ? contactData.links.map(link => `- [[${link}]]`).join('\n')
                : '';
                
            content = content.replace(/{{links_array}}/g, linksArrayContent);
            content = content.replace(/{{links}}/g, linksContent);
            
            // Handle tags
            const tagsStr = contactData.tags && contactData.tags.length > 0 
                ? contactData.tags.join(', ') 
                : '';
            content = content.replace(/{{tags}}/g, tagsStr);
            
            // Create the file
            const file = await this.app.vault.create(filePath, content);
            
            new obsidian.Notice(`Contact "${contactData.name}" created successfully!`);
            
            // Open the newly created contact file
            this.app.workspace.getLeaf().openFile(file);
            
            return file;
        } catch (error) {
            console.error('Error creating contact:', error);
            new obsidian.Notice('Failed to create contact. Check console for details.');
            return null;
        }
    }
    
    // Generate a contact ID from name
    generateContactId(name) {
        // Create a slug from the name
        return name
            .toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .slice(0, 50); // Limit length
    }
    
    // Link a file to a contact with improved implementation
    async linkFileToContact(contactId, filePath) {
        try {
            const contactsFolder = this.settings.contactsFolder;
            const contactFilePath = `${contactsFolder}/${contactId}.md`;
            
            // Check if contact file exists
            const exists = await this.app.vault.adapter.exists(contactFilePath);
            if (!exists) {
                new obsidian.Notice(`Contact with ID "${contactId}" not found.`);
                return false;
            }
            
            const contactFile = this.app.vault.getAbstractFileByPath(contactFilePath);
            if (!(contactFile instanceof obsidian.TFile)) {
                new obsidian.Notice(`Invalid contact file: ${contactFilePath}`);
                return false;
            }
            
            // Read contact file content
            const content = await this.app.vault.read(contactFile);
            
            // Extract just the filename without extension from the path
            const filePathParts = filePath.split('/');
            const fileName = filePathParts[filePathParts.length - 1].replace(/\.[^.]+$/, '');
            
            // Check if the file is already linked
            const linkPattern = new RegExp(`\\[\\[${fileName}(\\|[^\\]]+)?\\]\\]`);
            if (linkPattern.test(content)) {
                new obsidian.Notice(`File "${fileName}" is already linked to this contact.`);
                return false;
            }
            
            // Extract frontmatter to update links array
            const frontmatter = this.extractFrontmatter(content);
            let links = [];
            
            if (frontmatter && frontmatter.links) {
                if (Array.isArray(frontmatter.links)) {
                    links = [...frontmatter.links];
                } else if (typeof frontmatter.links === 'string') {
                    try {
                        links = JSON.parse(frontmatter.links);
                    } catch {
                        // If parsing fails, try to split by comma
                        links = frontmatter.links.split(',').map(l => l.trim());
                    }
                }
            }
            
            // Add new link to array if not already present
            if (!links.includes(fileName)) {
                links.push(fileName);
            }
            
            // Update frontmatter
            let updatedContent = content;
            const frontmatterRegex = /(---\n[\s\S]*?links:\s*)(.*?)(\n[\s\S]*?\n---)/;
            const linksMatch = content.match(frontmatterRegex);
            
            if (linksMatch) {
                // Update existing links in frontmatter
                updatedContent = content.replace(
                    frontmatterRegex,
                    `$1[${links.map(l => `"${l}"`).join(', ')}]$3`
                );
            } else {
                // Add links to frontmatter if not present
                updatedContent = content.replace(
                    /(---\n[\s\S]*?)(\n---)/,
                    `$1\nlinks: [${links.map(l => `"${l}"`).join(', ')}]$2`
                );
            }
            
            // Add link to the Linked Files section
            if (updatedContent.includes('## Linked Files')) {
                // Add link under the existing section
                updatedContent = updatedContent.replace(
                    /## Linked Files\n/,
                    `## Linked Files\n- [[${fileName}]]\n`
                );
            } else {
                // Add new Linked Files section at the end
                updatedContent = updatedContent + `\n## Linked Files\n- [[${fileName}]]\n`;
            }
            
            // Update the file
            await this.app.vault.modify(contactFile, updatedContent);
            
            new obsidian.Notice(`Linked "${fileName}" to contact "${contactId}" successfully!`);
            return true;
        } catch (error) {
            console.error('Error linking file to contact:', error);
            new obsidian.Notice('Failed to link file to contact. Check console for details.');
            return false;
        }
    }
}

// Settings Tab
class ContactsSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Contacts Plugin Settings' });

        new obsidian.Setting(containerEl)
            .setName('Contacts Folder')
            .setDesc('The folder where your contacts will be stored')
            .addText(text => text
                .setPlaceholder('Contacts')
                .setValue(this.plugin.settings.contactsFolder)
                .onChange(async (value) => {
                    this.plugin.settings.contactsFolder = value;
                    await this.plugin.saveSettings();
                }));

        new obsidian.Setting(containerEl)
            .setName('Enable Ribbon Icon')
            .setDesc('Show the contacts icon in the left ribbon')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableRibbonIcon)
                .onChange(async (value) => {
                    this.plugin.settings.enableRibbonIcon = value;
                    await this.plugin.saveSettings();
                    // Reload plugin to update ribbon
                    this.plugin.onunload();
                    this.plugin.onload();
                }));

        // Graph Settings section
        containerEl.createEl('h3', { text: 'Graph Visualization Settings' });

        new obsidian.Setting(containerEl)
            .setName('Node Size')
            .setDesc('Size of nodes in the graph visualization')
            .addSlider(slider => slider
                .setLimits(4, 16, 1)
                .setValue(this.plugin.settings.graphSettings.nodeSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.graphSettings.nodeSize = value;
                    await this.plugin.saveSettings();
                }));

        new obsidian.Setting(containerEl)
            .setName('Contact Node Color')
            .setDesc('Color for contact nodes in the graph')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.graphSettings.contactNodeColor)
                .onChange(async (value) => {
                    this.plugin.settings.graphSettings.contactNodeColor = value;
                    await this.plugin.saveSettings();
                }));

        new obsidian.Setting(containerEl)
            .setName('File Node Color')
            .setDesc('Color for file nodes in the graph')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.graphSettings.fileNodeColor)
                .onChange(async (value) => {
                    this.plugin.settings.graphSettings.fileNodeColor = value;
                    await this.plugin.saveSettings();
                }));

        new obsidian.Setting(containerEl)
            .setName('Link Strength')
            .setDesc('Strength of links between nodes (higher values = closer nodes)')
            .addSlider(slider => slider
                .setLimits(10, 100, 5)
                .setValue(this.plugin.settings.graphSettings.linkStrength)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.graphSettings.linkStrength = value;
                    await this.plugin.saveSettings();
                }));

        new obsidian.Setting(containerEl)
            .setName('Repel Force')
            .setDesc('Force pushing nodes apart (higher values = more spacing)')
            .addSlider(slider => slider
                .setLimits(50, 500, 10)
                .setValue(this.plugin.settings.graphSettings.repelForce)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.graphSettings.repelForce = value;
                    await this.plugin.saveSettings();
                }));

        new obsidian.Setting(containerEl)
            .setName('Center Force')
            .setDesc('Force pulling nodes to center (higher values = more centered)')
            .addSlider(slider => slider
                .setLimits(0.1, 1.0, 0.1)
                .setValue(this.plugin.settings.graphSettings.centerForce)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.graphSettings.centerForce = value;
                    await this.plugin.saveSettings();
                }));

        // Template Settings section
        containerEl.createEl('h3', { text: 'Contact Template Settings' });

        new obsidian.Setting(containerEl)
            .setName('Default Contact Template')
            .setDesc('Template used for creating new contacts (use {{variable}} as placeholders)')
            .addTextArea(text => text
                .setPlaceholder('Template')
                .setValue(this.plugin.settings.defaultContactTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.defaultContactTemplate = value;
                    await this.plugin.saveSettings();
                }))
            .setClass('contacts-template-setting');

        // Add some CSS to make the template textarea larger
        containerEl.createEl('style', {
            text: `
                .contacts-template-setting textarea {
                    min-height: 200px;
                    width: 100%;
                    font-family: monospace;
                }
            `
        });
    }
}

module.exports = ContactsPlugin;