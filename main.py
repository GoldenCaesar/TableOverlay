import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import os
import mutagen
from mutagen.easyid3 import EasyID3
import threading
import tempfile
import subprocess
import shutil
import math
import queue

class AudioMetadataEditor(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Audiobook Metadata Editor")
        self.geometry("1200x600")

        self.file_paths = {}

        self.tree_frame = ttk.Frame(self)
        self.tree_frame.pack(pady=10, padx=10, fill="both", expand=True)

        self.tree_scroll_y = ttk.Scrollbar(self.tree_frame)
        self.tree_scroll_y.pack(side="right", fill="y")
        self.tree_scroll_x = ttk.Scrollbar(self.tree_frame, orient="horizontal")
        self.tree_scroll_x.pack(side="bottom", fill="x")

        self.tree = ttk.Treeview(self.tree_frame, yscrollcommand=self.tree_scroll_y.set, xscrollcommand=self.tree_scroll_x.set, show='headings')
        self.tree.pack(fill="both", expand=True)

        self.tree_scroll_y.config(command=self.tree.yview)
        self.tree_scroll_x.config(command=self.tree.xview)

        self.columns = {
            "file_name": "File Name",
            "file_size": "File Size (MB)",
            "duration": "Duration (s)",
            "title": "Title",
            "artist": "Contributing Artist(s)",
            "album_artist": "Album Artist",
            "album": "Album",
            "track_number": "Track #",
            "trim_intro": "Trim Intro",
            "trim_outro": "Trim Outro"
        }
        self.tree["columns"] = list(self.columns.keys())

        for col_id, col_text in self.columns.items():
            self.tree.heading(col_id, text=col_text, command=lambda _col=col_id: self.sort_column(_col, False))
            self.tree.column(col_id, width=100)

        self.button_frame = ttk.Frame(self)
        self.button_frame.pack(pady=10)

        self.open_folder_button = ttk.Button(self.button_frame, text="Open Folder", command=self.open_folder)
        self.open_folder_button.pack(side="left", padx=5)

        self.process_button = ttk.Button(self.button_frame, text="Process Files", command=self.process_files)
        self.process_button.pack(side="left", padx=5)

        self.tree.bind("<Double-1>", self.on_double_click)

        self.check_ffmpeg()

    def check_ffmpeg(self):
        try:
            subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True, text=True)
            subprocess.run(["ffprobe", "-version"], capture_output=True, check=True, text=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            messagebox.showerror("Error", "ffmpeg and ffprobe not found. Please install ffmpeg and ensure it is in your system's PATH. All file operations will be disabled.")
            self.process_button.config(state="disabled")
            self.open_folder_button.config(state="disabled")

    def open_folder(self):
        folder_path = filedialog.askdirectory()
        if not folder_path:
            return

        for i in self.tree.get_children():
            self.tree.delete(i)
        self.file_paths.clear()

        for filename in os.listdir(folder_path):
            if filename.lower().endswith(('.mp3', '.wav', '.flac', '.m4a', '.ogg', '.opus')):
                filepath = os.path.join(folder_path, filename)
                self.load_audio_file(filepath)

    def get_audio_duration(self, filepath):
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filepath],
                capture_output=True, text=True, check=True
            )
            return float(result.stdout.strip())
        except (subprocess.CalledProcessError, FileNotFoundError, ValueError) as e:
            print(f"Could not get duration for {filepath}: {e}")
            return 0

    def load_audio_file(self, filepath):
        try:
            file_size = os.path.getsize(filepath) / (1024 * 1024)
            duration = self.get_audio_duration(filepath)

            try:
                tags = EasyID3(filepath)
            except:
                tags = {}

            title = tags.get('title', [''])[0]
            artist = tags.get('artist', [''])[0]
            album_artist = tags.get('albumartist', [''])[0]
            album = tags.get('album', [''])[0]
            track_number = tags.get('tracknumber', [''])[0]

            item_id = self.tree.insert("", "end", values=(
                os.path.basename(filepath),
                f"{file_size:.2f}",
                f"{duration:.2f}",
                title,
                artist,
                album_artist,
                album,
                track_number,
                "No",
                "No"
            ))
            self.file_paths[item_id] = filepath

        except Exception as e:
            messagebox.showerror("Error", f"Could not load file {os.path.basename(filepath)}: {e}")

    def on_double_click(self, event):
        region = self.tree.identify("region", event.x, event.y)
        if region != "cell":
            return

        column_id = self.tree.identify_column(event.x)
        column_index = int(column_id.replace("#", "")) - 1
        column_name = self.tree["columns"][column_index]

        editable_columns = ["title", "artist", "album_artist", "album", "track_number"]
        checkbox_columns = ["trim_intro", "trim_outro"]

        if column_name in editable_columns:
            self.edit_cell(event)
        elif column_name in checkbox_columns:
            self.toggle_checkbox(event)

    def edit_cell(self, event):
        item_id = self.tree.focus()
        if not item_id:
            return

        column_id = self.tree.identify_column(event.x)

        x, y, width, height = self.tree.bbox(item_id, column_id)

        value = self.tree.set(item_id, column_id)
        entry = ttk.Entry(self.tree_frame, width=width)
        entry.place(x=x, y=y, width=width, height=height)
        entry.insert(0, value)
        entry.focus()

        def on_focus_out(event):
            self.tree.set(item_id, column_id, entry.get())
            entry.destroy()

        entry.bind("<FocusOut>", on_focus_out)
        entry.bind("<Return>", on_focus_out)

    def toggle_checkbox(self, event):
        item_id = self.tree.focus()
        if not item_id:
            return

        column_id = self.tree.identify_column(event.x)
        current_value = self.tree.set(item_id, column_id)
        new_value = "Yes" if current_value == "No" else "No"
        self.tree.set(item_id, column_id, new_value)


    def sort_column(self, col, reverse):
        l = [(self.tree.set(k, col), k) for k in self.tree.get_children('')]
        try:
            l.sort(key=lambda t: float(t[0]), reverse=reverse)
        except ValueError:
            l.sort(key=lambda t: t[0], reverse=reverse)

        for index, (val, k) in enumerate(l):
            self.tree.move(k, '', index)

        self.tree.heading(col, command=lambda: self.sort_column(col, not reverse))

    def process_files(self):
        output_folder = filedialog.askdirectory()
        if not output_folder:
            return

        self.progress_window = tk.Toplevel(self)
        self.progress_window.title("Processing...")
        self.progress_label = ttk.Label(self.progress_window, text="Starting processing...")
        self.progress_label.pack(padx=20, pady=10)
        self.progress_bar = ttk.Progressbar(self.progress_window, orient="horizontal", length=300, mode="determinate")
        self.progress_bar.pack(padx=20, pady=10)

        self.queue = queue.Queue()
        self.check_queue()

        processing_thread = threading.Thread(target=self.processing_thread, args=(output_folder, self.queue))
        processing_thread.start()

    def check_queue(self):
        try:
            message = self.queue.get_nowait()
            if message[0] == 'progress':
                _, text, value = message
                self.progress_label.config(text=text)
                self.progress_bar['value'] = value
            elif message[0] == 'complete':
                self.progress_label.config(text="Processing complete!")
                self.progress_window.after(2000, self.progress_window.destroy)
                return # Stop checking
            elif message[0] == 'error':
                 _, title, msg = message
                 messagebox.showerror(title, msg)

        except queue.Empty:
            pass
        self.after(100, self.check_queue)


    def processing_thread(self, output_folder, q):
        items = self.tree.get_children('')
        total_files = len(items)

        for i, item_id in enumerate(items):
            full_path = self.file_paths[item_id]

            q.put(('progress', f"Processing {os.path.basename(full_path)}...", i))

            values = self.tree.item(item_id, "values")

            new_metadata = {
                "title": values[3],
                "artist": values[4],
                "album_artist": values[5],
                "album": values[6],
                "track_number": values[7],
            }

            trim_intro = values[8] == "Yes"
            trim_outro = values[9] == "Yes"

            output_filename = f"{os.path.splitext(os.path.basename(full_path))[0]}.mp3"
            output_path = os.path.join(output_folder, output_filename)

            try:
                self.process_single_file(full_path, output_path, new_metadata, trim_intro, trim_outro)
            except Exception as e:
                error_message = f"Failed to process {os.path.basename(full_path)}: {e}"
                if isinstance(e, subprocess.CalledProcessError):
                    error_message += f"\n\nffmpeg error:\n{e.stderr}"
                q.put(('error', "Processing Error", error_message))

        q.put(('complete',))


    def process_single_file(self, input_path, output_path, metadata, trim_intro, trim_outro):
        if not trim_intro and not trim_outro:
            # Efficiently copy or convert file, then apply metadata
            if os.path.splitext(input_path)[1].lower() == '.mp3':
                shutil.copy(input_path, output_path)
            else:
                subprocess.run(
                    ["ffmpeg", "-i", input_path, "-codec:a", "libmp3lame", "-q:a", "2", output_path],
                    check=True, capture_output=True
                )
            self.apply_metadata_to_file(output_path, metadata, input_path)
            return

        temp_dir = tempfile.mkdtemp()
        try:
            duration = self.get_audio_duration(input_path)
            if duration == 0:
                raise ValueError("Could not get audio duration.")

            chunk_size_s = 10 * 60
            num_chunks = math.ceil(duration / chunk_size_s)

            temp_chunk_files = []
            for i in range(num_chunks):
                start_time = i * chunk_size_s
                t_param = ["-t", str(chunk_size_s)] if i < num_chunks - 1 else []

                chunk_path = os.path.join(temp_dir, f"chunk{i}.mp3")

                ffmpeg_cmd = ["ffmpeg", "-y", "-i", input_path, "-ss", str(start_time)]
                ffmpeg_cmd.extend(t_param)

                if i == 0 and trim_intro:
                    ffmpeg_cmd.extend(["-af", "silenceremove=start_periods=1:start_threshold=-40dB"])
                # The 'areverse' filter chain is the correct way to trim from the end.
                # It reverses the chunk, trims silence from the (now) beginning, and reverses it back.
                elif i == num_chunks - 1 and trim_outro:
                    ffmpeg_cmd.extend(["-af", "areverse,silenceremove=start_periods=1:start_threshold=-40dB,areverse"])

                ffmpeg_cmd.append(chunk_path)
                subprocess.run(ffmpeg_cmd, check=True, capture_output=True)
                temp_chunk_files.append(chunk_path)

            list_path = os.path.join(temp_dir, "concat_list.txt")
            with open(list_path, "w", encoding="utf-8") as f:
                for chunk_path in temp_chunk_files:
                    safe_chunk_path = chunk_path.replace("\\", "/")
                    f.write(f"file '{safe_chunk_path}'\n")

            concatenated_path = os.path.join(temp_dir, "concatenated.mp3")
            safe_concatenated_path = concatenated_path.replace("\\", "/")
            safe_list_path = list_path.replace("\\", "/")

            subprocess.run(
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", safe_list_path, "-c", "copy", safe_concatenated_path],
                check=True, capture_output=True
            )

            shutil.copy(concatenated_path, output_path)
            self.apply_metadata_to_file(output_path, metadata, input_path)

        finally:
            shutil.rmtree(temp_dir)

    def apply_metadata_to_file(self, file_path, metadata, original_path):
        audio = mutagen.File(file_path, easy=True)
        if audio.tags is None:
            audio.add_tags()

        # Copy all tags from original file first to preserve them
        try:
            original_audio = mutagen.File(original_path, easy=True)
            if original_audio and original_audio.tags:
                audio.tags.clear()
                for key, value in original_audio.tags.items():
                    audio.tags[key] = value
        except Exception as e:
            print(f"Could not copy tags from {original_path}: {e}")

        # Apply changes from GUI
        audio['title'] = metadata.get('title', '')
        audio['artist'] = metadata.get('artist', '')
        audio['albumartist'] = metadata.get('album_artist', '')
        audio['album'] = metadata.get('album', '')
        audio['tracknumber'] = metadata.get('track_number', '')
        audio.save()


if __name__ == "__main__":
    app = AudioMetadataEditor()
    app.mainloop()
