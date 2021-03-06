import { PluginSettingTab, Setting, Notice } from 'obsidian'
import * as AnkiConnect from './anki'

const defaultDescs = {
	"Tag": "The tag that the plugin automatically adds to any generated cards.",
	"Deck": "The deck the plugin adds cards to if TARGET DECK is not specified in the file.",
	"Add File Link": "Append a link to the file that generated the flashcard on the field specified in the table.",
	"CurlyCloze": "Convert {cloze deletions} -> {{c1::cloze deletions}} on note types that have a 'Cloze' in their name.",
	"Regex": "Scan using the provided custom regexps rather than the START END syntax.",
	"ID Comments": "Wrap note IDs in a HTML comment."
}

export class SettingsTab extends PluginSettingTab {

	setup_table() {
		let {containerEl} = this;
		const plugin = (this as any).plugin
		containerEl.createEl('h3', {text: 'Note type settings'})
		let note_type_table = containerEl.createEl('table', {cls: "anki-settings-table"})
		let head = note_type_table.createTHead()
		let header_row = head.insertRow()
		for (let header of ["Note Type", "Custom Regexp", "File Link Field"]) {
			let th = document.createElement("th")
			th.appendChild(document.createTextNode(header))
			header_row.appendChild(th)
		}
		let main_body = note_type_table.createTBody()
		for (let note_type of plugin.note_types) {
			let row = main_body.insertRow()
			row.insertCell()
			row.insertCell()
			row.insertCell()
			let row_cells = row.children
			row_cells[0].innerHTML = note_type

			let regexp_section = plugin.settings["CUSTOM_REGEXPS"]
			let custom_regexp = new Setting(row_cells[1] as HTMLElement)
				.addText(
						text => text.setValue(
						regexp_section.hasOwnProperty(note_type) ? regexp_section[note_type] : ""
						)
						.onChange((value) => {
							plugin.settings["CUSTOM_REGEXPS"][note_type] = value
							plugin.saveAllData()
						})
				)
			custom_regexp.settingEl = row_cells[1] as HTMLElement
			custom_regexp.infoEl.remove()
			custom_regexp.controlEl.className += " anki-center"

			let fields_section = plugin.settings.FILE_LINK_FIELDS
			let link_field = new Setting(row_cells[2] as HTMLElement)
				.addDropdown(
					async dropdown => {
						if (!(plugin.fields_dict[note_type])) {
							plugin.fields_dict = await plugin.loadFieldsDict()
							if (Object.keys(plugin.fields_dict).length != plugin.note_types.length) {
								new Notice('Need to connect to Anki to generate fields dictionary...')
								try {
									plugin.fields_dict = await plugin.generateFieldsDict()
									new Notice("Fields dictionary successfully generated!")
								}
								catch(e) {
									new Notice("Couldn't connect to Anki! Check console for error message.")
									return
								}
							}
						}
						const field_names = plugin.fields_dict[note_type]
						for (let field of field_names) {
							dropdown.addOption(field, field)
						}
						dropdown.setValue(
							fields_section.hasOwnProperty(note_type) ? fields_section[note_type] : field_names[0]
						)
						dropdown.onChange((value) => {
							plugin.settings.FILE_LINK_FIELDS[note_type] = value
							plugin.saveAllData()
						})
					}
				)
			link_field.settingEl = row_cells[2] as HTMLElement
			link_field.infoEl.remove()
			link_field.controlEl.className += " anki-center"
		}
	}

	setup_syntax() {
		let {containerEl} = this;
		const plugin = (this as any).plugin
		let syntax_settings = containerEl.createEl('h3', {text: 'Syntax Settings'})
		for (let key of Object.keys(plugin.settings["Syntax"])) {
			new Setting(syntax_settings)
				.setName(key)
				.addText(
						text => text.setValue(plugin.settings["Syntax"][key])
						.onChange((value) => {
							plugin.settings["Syntax"][key] = value
							plugin.saveAllData()
						})
				)
		}
	}

	setup_defaults() {
		let {containerEl} = this;
		const plugin = (this as any).plugin
		let defaults_settings = containerEl.createEl('h3', {text: 'Defaults'})
		for (let key of Object.keys(plugin.settings["Defaults"])) {
			if (typeof plugin.settings["Defaults"][key] === "string") {
				new Setting(defaults_settings)
					.setName(key)
					.setDesc(defaultDescs[key])
					.addText(
						text => text.setValue(plugin.settings["Defaults"][key])
						.onChange((value) => {
							plugin.settings["Defaults"][key] = value
							plugin.saveAllData()
						})
				)
			} else {
				new Setting(defaults_settings)
					.setName(key)
					.setDesc(defaultDescs[key])
					.addToggle(
						toggle => toggle.setValue(plugin.settings["Defaults"][key])
						.onChange((value) => {
							plugin.settings["Defaults"][key] = value
							plugin.saveAllData()
						})
					)
			}
		}
	}

	setup_buttons() {
		let {containerEl} = this
		const plugin = (this as any).plugin
		let action_buttons = containerEl.createEl('h3', {text: 'Actions'})
		new Setting(action_buttons)
			.setName("Regenerate Table")
			.setDesc("Connect to Anki to regenerate the table with new note types, or get rid of deleted note types.")
			.addButton(
				button => {
					button.setButtonText("Regenerate").setClass("mod-cta")
					.onClick(async () => {
						new Notice("Need to connect to Anki to update note types...")
						try {
							plugin.note_types = await AnkiConnect.invoke('modelNames')
							plugin.regenerateSettingsRegexps()
							plugin.fields_dict = await plugin.loadFieldsDict()
							if (Object.keys(plugin.fields_dict).length != plugin.note_types.length) {
								new Notice('Need to connect to Anki to generate fields dictionary...')
								try {
									plugin.fields_dict = await plugin.generateFieldsDict()
									new Notice("Fields dictionary successfully generated!")
								}
								catch(e) {
									new Notice("Couldn't connect to Anki! Check console for error message.")
									return
								}
							}
							await plugin.saveAllData()
							this.setup_display()
							new Notice("Note types updated!")
						} catch(e) {
							new Notice("Couldn't connect to Anki! Check console for details.")
						}
					})
				}
			)
		new Setting(action_buttons)
			.setName("Clear Media Cache")
			.setDesc(`Clear the cached list of media filenames that have been added to Anki.

			The plugin will skip over adding a media file if it's added a file with the same name before, so clear this if e.g. you've updated the media file with the same name.`)
			.addButton(
				button => {
					button.setButtonText("Clear").setClass("mod-cta")
					.onClick(async () => {
						plugin.added_media = []
						await plugin.saveAllData()
						new Notice("Media Cache cleared successfully!")
					})
				}
			)
		new Setting(action_buttons)
			.setName("Clear File Hash Cache")
			.setDesc(`Clear the cached dictionary of file hashes that the plugin has scanned before.

			The plugin will skip over a file if the file path and the hash is unaltered.`)
			.addButton(
				button => {
					button.setButtonText("Clear").setClass("mod-cta")
					.onClick(async () => {
						plugin.file_hashes = {}
						await plugin.saveAllData()
						new Notice("File Hash Cache cleared successfully!")
					})
				}
			)
	}

	setup_display() {
		let {containerEl} = this

		containerEl.empty()
		containerEl.createEl('h2', {text: 'Obsidian_to_Anki settings'})
		this.setup_table()
		this.setup_syntax()
		this.setup_defaults()
		this.setup_buttons()
	}

	async display() {
		this.setup_display()
	}
}
