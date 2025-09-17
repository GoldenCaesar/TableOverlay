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
import sys
import logging

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

    def open_folder(self):
        folder_path = filedialog.askdirectory()
        if not folder_path:
            logging.info("No folder selected.")
            return

        logging.info(f"Opening folder: {folder_path}")

        for i in self.tree.get_children():
            self.tree.delete(i)
        self.file_paths.clear()

        for filename in os.listdir(folder_path):
            if filename.lower().endswith(('.mp3', '.wav', '.flac', '.m4a', '.ogg', '.opus')):
                filepath = os.path.join(folder_path, filename)
                self.load_audio_file(filepath)
        logging.info("Finished loading files from folder.")

    def get_audio_duration(self, filepath):
        logging.debug(f"Getting duration for {filepath}")
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filepath],
                capture_output=True, text=True, check=True
            )
            duration = float(result.stdout.strip())
            logging.debug(f"Duration for {filepath} is {duration}s.")
            return duration
        except (subprocess.CalledProcessError, FileNotFoundError, ValueError) as e:
            logging.error(f"Could not get duration for {filepath}: {e}")
            return 0

    def load_audio_file(self, filepath):
        logging.info(f"Loading audio file: {filepath}")
        try:
            file_size = os.path.getsize(filepath) / (1024 * 1024)
            duration = self.get_audio_duration(filepath)

            try:
                tags = EasyID3(filepath)
            except Exception as e:
                logging.warning(f"Could not read ID3 tags for {filepath}: {e}")
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
            logging.info(f"Successfully loaded {os.path.basename(filepath)}.")

        except Exception as e:
            logging.error(f"Could not load file {os.path.basename(filepath)}: {e}")
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
            logging.info("Processing cancelled, no output folder selected.")
            return

        items = self.tree.get_children('')
        if not items:
            messagebox.showinfo("No files", "There are no files to process.")
            return

        logging.info(f"Starting to process files. Output folder: {output_folder}")

        self.progress_window = tk.Toplevel(self)
        self.progress_window.title("Processing...")

        ttk.Label(self.progress_window, text="Total Progress").pack(padx=20, pady=(10, 0))
        self.total_progress_label = ttk.Label(self.progress_window, text="Starting processing...")
        self.total_progress_label.pack(padx=20, pady=5)
        self.total_progress_bar = ttk.Progressbar(self.progress_window, orient="horizontal", length=400, mode="determinate", maximum=len(items))
        self.total_progress_bar.pack(padx=20, pady=(0, 10))

        self.sub_task_label = ttk.Label(self.progress_window, text="")
        self.sub_task_label.pack(padx=20, pady=(10, 0))
        self.sub_task_progress_bar = ttk.Progressbar(self.progress_window, orient="horizontal", length=400, mode="determinate")
        self.sub_task_progress_bar.pack(padx=20, pady=(5, 10))

        self.sub_task_label.pack_forget()
        self.sub_task_progress_bar.pack_forget()

        self.queue = queue.Queue()
        self.check_queue()

        processing_thread = threading.Thread(target=self.processing_thread, args=(output_folder, self.queue, items))
        processing_thread.start()

    def check_queue(self):
        try:
            message = self.queue.get_nowait()
            if message[0] == 'progress':
                _, text, value = message
                self.total_progress_label.config(text=text)
                self.total_progress_bar['value'] = value
            elif message[0] == 'sub_task_start':
                _, label, max_value = message
                self.sub_task_label.config(text=label)
                self.sub_task_progress_bar.config(maximum=max_value, value=0)
                self.sub_task_label.pack(padx=20, pady=(10, 0))
                self.sub_task_progress_bar.pack(padx=20, pady=(5, 10))
            elif message[0] == 'sub_task_progress':
                _, value = message
                self.sub_task_progress_bar['value'] = value
            elif message[0] == 'sub_task_end':
                self.sub_task_label.pack_forget()
                self.sub_task_progress_bar.pack_forget()
            elif message[0] == 'complete':
                self.total_progress_label.config(text="Processing complete!")
                self.sub_task_label.pack_forget()
                self.sub_task_progress_bar.pack_forget()
                self.progress_window.after(2000, self.progress_window.destroy)
                return # Stop checking
            elif message[0] == 'error':
                 _, title, msg = message
                 messagebox.showerror(title, msg)

        except queue.Empty:
            pass
        self.after(100, self.check_queue)


    def processing_thread(self, output_folder, q, items):
        logging.info("Processing thread started.")
        total_files = len(items)
        logging.info(f"Found {total_files} file(s) to process.")

        for i, item_id in enumerate(items):
            full_path = self.file_paths[item_id]
            filename = os.path.basename(full_path)
            logging.info(f"[{i+1}/{total_files}] Starting processing for: {filename}")

            q.put(('progress', f"Processing {i+1}/{total_files}: {filename}...", i + 1))

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
                self.process_single_file(full_path, output_path, new_metadata, trim_intro, trim_outro, q)
                logging.info(f"Successfully processed {filename}.")
            except Exception as e:
                error_message = f"Failed to process {os.path.basename(full_path)}: {e}"
                if isinstance(e, subprocess.CalledProcessError):
                    error_message += f"\n\nffmpeg error:\n{e.stderr}"
                logging.error(error_message)
                q.put(('error', "Processing Error", error_message))

        logging.info("Processing thread finished.")
        q.put(('complete',))


    def process_single_file(self, input_path, output_path, metadata, trim_intro, trim_outro, q):
        filename = os.path.basename(input_path)
        logging.info(f"Processing details for {filename}: Trim Intro={trim_intro}, Trim Outro={trim_outro}")

        if not trim_intro and not trim_outro:
            logging.info(f"No trimming required for {filename}. Converting and applying metadata.")
            if os.path.splitext(input_path)[1].lower() == '.mp3':
                logging.info(f"Copying {filename} directly as it is an MP3.")
                shutil.copy(input_path, output_path)
            else:
                logging.info(f"Converting {filename} to MP3.")
                subprocess.run(
                    ["ffmpeg", "-i", input_path, "-codec:a", "libmp3lame", "-q:a", "2", output_path],
                    check=True, capture_output=True, text=True
                )
            self.apply_metadata_to_file(output_path, metadata, input_path)
            return

        temp_dir = tempfile.mkdtemp()
        logging.debug(f"Created temporary directory for processing: {temp_dir}")
        try:
            duration = self.get_audio_duration(input_path)
            if duration == 0:
                raise ValueError("Could not get audio duration.")

            chunk_size_s = 10 * 60
            num_chunks = math.ceil(duration / chunk_size_s)
            logging.info(f"Splitting {filename} into {num_chunks} chunk(s) for trimming.")
            q.put(('sub_task_start', f"Splitting into {num_chunks} chunks...", num_chunks))

            temp_chunk_files = []
            for i in range(num_chunks):
                start_time = i * chunk_size_s
                t_param = ["-t", str(chunk_size_s)] if i < num_chunks - 1 else []

                chunk_path = os.path.join(temp_dir, f"chunk{i}.mp3")
                logging.debug(f"Processing chunk {i} for {filename}.")
                q.put(('sub_task_progress', i + 1))

                ffmpeg_cmd = ["ffmpeg", "-y", "-i", input_path, "-ss", str(start_time)]
                ffmpeg_cmd.extend(t_param)

                if i == 0 and trim_intro:
                    logging.info(f"Trimming intro silence from chunk {i} of {filename}.")
                    ffmpeg_cmd.extend(["-af", "silenceremove=start_periods=1:start_threshold=-40dB"])
                elif i == num_chunks - 1 and trim_outro:
                    logging.info(f"Trimming outro silence from chunk {i} of {filename}.")
                    ffmpeg_cmd.extend(["-af", "areverse,silenceremove=start_periods=1:start_threshold=-40dB,areverse"])

                ffmpeg_cmd.append(chunk_path)
                logging.debug(f"Running ffmpeg command: {' '.join(ffmpeg_cmd)}")
                subprocess.run(ffmpeg_cmd, check=True, capture_output=True, text=True)
                temp_chunk_files.append(chunk_path)

            q.put(('sub_task_end',))

            list_path = os.path.join(temp_dir, "concat_list.txt")
            logging.info(f"Concatenating {len(temp_chunk_files)} chunk(s) for {filename}.")
            q.put(('sub_task_start', f"Concatenating {len(temp_chunk_files)} chunks...", 1))
            with open(list_path, "w", encoding="utf-8") as f:
                for chunk_path in temp_chunk_files:
                    safe_chunk_path = chunk_path.replace("\\", "/")
                    f.write(f"file '{safe_chunk_path}'\n")

            concatenated_path = os.path.join(temp_dir, "concatenated.mp3")
            safe_concatenated_path = concatenated_path.replace("\\", "/")
            safe_list_path = list_path.replace("\\", "/")

            concat_cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", safe_list_path, "-c", "copy", safe_concatenated_path]
            logging.debug(f"Running ffmpeg command: {' '.join(concat_cmd)}")
            subprocess.run(
                concat_cmd,
                check=True, capture_output=True, text=True
            )
            q.put(('sub_task_progress', 1))
            q.put(('sub_task_end',))

            logging.info(f"Copying final processed file to output folder: {output_path}")
            shutil.copy(concatenated_path, output_path)
            self.apply_metadata_to_file(output_path, metadata, input_path)

        finally:
            q.put(('sub_task_end',))
            logging.info(f"Cleaning up temporary directory: {temp_dir}")
            shutil.rmtree(temp_dir)

    def apply_metadata_to_file(self, file_path, metadata, original_path):
        filename = os.path.basename(file_path)
        logging.info(f"Applying metadata to {filename}.")
        audio = mutagen.File(file_path, easy=True)
        if audio.tags is None:
            logging.info(f"No existing tags found for {filename}, creating new ones.")
            audio.add_tags()

        # Copy all tags from original file first to preserve them
        try:
            logging.debug(f"Copying existing tags from {os.path.basename(original_path)}.")
            original_audio = mutagen.File(original_path, easy=True)
            if original_audio and original_audio.tags:
                audio.tags.clear()
                for key, value in original_audio.tags.items():
                    audio.tags[key] = value
        except Exception as e:
            logging.warning(f"Could not copy tags from {original_path}: {e}")

        # Apply changes from GUI
        logging.debug(f"Applying new metadata to {filename}: {metadata}")
        audio['title'] = metadata.get('title', '')
        audio['artist'] = metadata.get('artist', '')
        audio['albumartist'] = metadata.get('album_artist', '')
        audio['album'] = metadata.get('album', '')
        audio['tracknumber'] = metadata.get('track_number', '')
        audio.save()
        logging.info(f"Metadata saved for {filename}.")


def check_dependencies():
    """Checks for required dependencies and exits if they are not found."""
    missing_deps = []
    try:
        import tkinter
        from tkinter import messagebox
        # If tkinter is present, we can use messagebox.
        # We need a root window to show the message, but we don't want the window to actually appear.
        show_error = lambda title, msg: messagebox.showerror(title, msg)
        root = tkinter.Tk()
        root.withdraw()
    except ImportError:
        missing_deps.append("tkinter")
        # If tkinter is not present, we can only print to stderr.
        show_error = lambda title, msg: print(f"ERROR: {title}\n{msg}", file=sys.stderr)

    try:
        import mutagen
    except ImportError:
        missing_deps.append("mutagen")

    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True, text=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        missing_deps.append("ffmpeg (and ffprobe)")

    if missing_deps:
        error_message = ("The following dependencies are missing or not in PATH:\n\n" +
                         "\n".join(f"- {dep}" for dep in missing_deps) +
                         "\n\nPlease install them and try again.")
        show_error("Missing Dependencies", error_message)
        sys.exit(1)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    check_dependencies()

    logging.info("Application starting.")
    app = AudioMetadataEditor()
    app.mainloop()
    logging.info("Application closed.")
