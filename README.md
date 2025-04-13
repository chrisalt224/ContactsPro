Contacts Pro for Obsidian

A powerful contact management plugin for Obsidian that allows you to create contact cards, link them to your notes, and visualize your network of connections.
Features
Contact Management

Create detailed contact cards with essential information (name, email, phone, company, title)
Add custom notes and tags to each contact
Store all contacts as regular Markdown files in your vault
Fully customize the contact template to match your workflow

Linking & Relationships

Link any notes or files in your vault to contacts
Right-click any file to quickly link it to a contact
Create bi-directional connections between your knowledge base and your contacts
See all files connected to each contact in one place

Three Powerful Visualization Options

Network View: Card-based interface showing contacts and their details
Interactive Graph View: Force-directed graph visualization with D3.js
Obsidian Native Graph Integration: Filter Obsidian's built-in graph to show your contact network

How to Use
Creating Contacts

Click the address book icon in the left sidebar
Use the command palette: "Create New Contact"
Fill in contact details (only name is required)

Linking Files to Contacts

Right-click on any file → "Link to Contact"
With a file open: Command palette → "Link Current File to Contact"
From contact details: Click "Link New File"

Viewing Your Contact Network

Network View: Click the network icon or use command "Open Contacts Network"
Graph View: Click the dot-network icon or use command "Open Contacts Graph"
In Obsidian's Graph: Use command "Filter Obsidian Graph to Contacts"

Installation
From GitHub

Download the main.js, manifest.json, and styles.css files
Create a folder called obsidian-contacts in your vault's .obsidian/plugins/ directory
Place the downloaded files in this folder
Restart Obsidian and enable the plugin in Settings → Community Plugins

Settings and Customization
Contact Settings

Contacts Folder: Change where contact files are stored
Contact Template: Customize the template for new contacts
Ribbon Icon: Toggle the visibility of the contact creation icon

Graph Visualization Settings

Node Colors: Set different colors for contacts and files
Node Size: Adjust the size of nodes in the graph
Link Strength: Control how strongly connected nodes are pulled together
Repel Force: Set how much nodes repel each other
Center Force: Control the strength of centering in the graph

Template Variables
When customizing the contact template, you can use these variables:

{{name}} - Contact's name
{{email}} - Email address
{{phone}} - Phone number
{{company}} - Company or organization
{{title}} - Job title or role
{{notes}} - Additional notes
{{links}} - Files linked to this contact (formatted as Markdown links)
{{links_array}} - Files linked to this contact (JSON array format for frontmatter)
{{tags}} - Contact tags

Requirements

Obsidian v0.15.0 or higher
Internet connection for Graph View (to load D3.js library)

Acknowledgements
This plugin utilizes:

D3.js for the interactive graph visualization
Obsidian's API for seamless integration with your vault

Support and Feedback
If you encounter issues or have feature requests, please create an issue on the GitHub repository.

Enjoy organizing your contacts and discovering connections between your notes and network!
