import tkinter as tk
from tkinter import ttk, messagebox
import tkintermapview
from tkinter import scrolledtext
import threading
import queue
import time
import configparser
import requests
import pyperclip
import os
import math

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Walking Route Planner")
        self.geometry("1024x768")

        # --- Load API key securely ---
        try:
            # Look for config.ini in the same directory as the script
            script_dir = os.path.dirname(__file__)
            config_path = os.path.join(script_dir, 'config.ini')
            config = configparser.ConfigParser()
            if not os.path.exists(config_path):
                 raise FileNotFoundError("config.ini not found in the script directory.")
            config.read(config_path)
            self.api_key = config['google_maps']['api_key']
        except Exception as e:
            messagebox.showerror("Configuration Error", f"Could not load API key from 'config.ini'.\n\nError: {e}")
            self.destroy()
            return

        self.pins = []
        self.markers = []
        self.route_path = None
        self.last_route_info = None
        # Logging and threading
        self.log_queue = queue.Queue()
        self.worker_thread = None

        # --- GUI Setup ---
        main_frame = ttk.Frame(self)
        main_frame.pack(fill=tk.BOTH, expand=True)

        control_frame = ttk.Frame(main_frame, width=320)
        control_frame.pack(side=tk.LEFT, fill=tk.Y, padx=10, pady=10)
        control_frame.pack_propagate(False)

        map_frame = ttk.Frame(main_frame)
        map_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)

        # --- Controls ---
        address_label = ttk.Label(control_frame, text="Address or Location:")
        address_label.pack(pady=(0, 5), anchor='w')
        self.address_entry = ttk.Entry(control_frame)
        self.address_entry.pack(fill=tk.X)
        self.address_entry.bind("<Return>", self.search_location)
        search_button = ttk.Button(control_frame, text="Search", command=self.search_location)
        search_button.pack(pady=5, anchor='w')

        duration_label = ttk.Label(control_frame, text="Target walk duration (minutes):")
        duration_label.pack(pady=(10, 5), anchor='w')
        self.duration_entry = ttk.Entry(control_frame)
        self.duration_entry.pack(fill=tk.X)
        self.duration_entry.insert(0, "120")

        self.avoid_highways_var = tk.BooleanVar()
        self.avoid_highways_check = ttk.Checkbutton(control_frame, text="Prevent routes on Main Roads", variable=self.avoid_highways_var)
        self.avoid_highways_check.pack(pady=10, anchor='w')

        calculate_button = ttk.Button(control_frame, text="Calculate Route", command=self.calculate_route)
        calculate_button.pack(pady=20)

        self.share_button = ttk.Button(control_frame, text="Share Route Link", command=self.share_route, state=tk.DISABLED)
        self.share_button.pack(pady=5)

        pins_frame = ttk.Frame(control_frame)
        pins_frame.pack(fill=tk.BOTH, expand=True, pady=10)
        pins_label = ttk.Label(pins_frame, text="Route Points:")
        pins_label.pack(anchor='w')

        listbox_frame = ttk.Frame(pins_frame)
        listbox_frame.pack(fill=tk.BOTH, expand=True)
        self.pins_listbox = tk.Listbox(listbox_frame)
        self.pins_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar = ttk.Scrollbar(listbox_frame, orient=tk.VERTICAL, command=self.pins_listbox.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.pins_listbox.config(yscrollcommand=scrollbar.set)

        remove_pin_button = ttk.Button(control_frame, text="Remove Last Pin", command=self.remove_last_pin)
        remove_pin_button.pack(pady=5, side=tk.BOTTOM)

        # --- Map ---
        self.map_widget = tkintermapview.TkinterMapView(map_frame, corner_radius=0)
        self.map_widget.pack(fill=tk.BOTH, expand=True)
        self.map_widget.set_position(40.7128, -74.0060)
        self.map_widget.set_zoom(12)
        self.map_widget.add_right_click_menu_command(label="Add Pin at this location", command=self.add_pin_from_map, pass_coords=True)

        # --- Footer (progress bar + log) ---
        footer_frame = ttk.Frame(self)
        footer_frame.pack(side=tk.BOTTOM, fill=tk.X)

        progress_frame = ttk.Frame(footer_frame)
        progress_frame.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=8, pady=6)
        self.progress = ttk.Progressbar(progress_frame, orient=tk.HORIZONTAL, mode='indeterminate')
        self.progress.pack(fill=tk.X, expand=True)

        log_frame = ttk.Frame(footer_frame)
        log_frame.pack(side=tk.RIGHT, fill=tk.BOTH, padx=8, pady=6)
        self.log_widget = scrolledtext.ScrolledText(log_frame, height=6, state='disabled')
        self.log_widget.pack(fill=tk.BOTH, expand=True)

        clear_log_btn = ttk.Button(log_frame, text="Clear Log", command=self.clear_log)
        clear_log_btn.pack(pady=4)

        # Start polling the log queue to update UI from worker threads
        self.after(100, self._process_log_queue)

    def calculate_route(self):
        """Kick off route calculation in a background thread and show progress/log UI."""
        self.clear_route()
        if len(self.pins) < 1:
            messagebox.showwarning("Warning", "Please add at least one pin to calculate a route.")
            return

        try:
            target_duration_minutes = int(self.duration_entry.get())
        except ValueError:
            messagebox.showerror("Error", "Please enter a valid number for the duration.")
            return

        # Disable UI elements that shouldn't be used while calculating
        self.progress.start(10)
        self.log(f"Starting route calculation for target {target_duration_minutes} minutes...")
        self.worker_thread = threading.Thread(target=self._calculate_route_thread, args=(target_duration_minutes,), daemon=True)
        self.worker_thread.start()

    def get_directions_for_pins(self, pins, silent=False):
        if not pins: return None
        origin = f"{pins[0]['lat']},{pins[0]['lng']}"
        destination = origin
        waypoints_str = "|".join([f"{p['lat']},{p['lng']}" for p in pins[1:]])

        url = f"https://maps.googleapis.com/maps/api/directions/json?origin={origin}&destination={destination}&waypoints={waypoints_str}&mode=walking&key={self.api_key}"
        if self.avoid_highways_var.get():
            url += "&avoid=highways|tolls|ferries"
            self.log("Avoiding highways, tolls, and ferries for this route.")

        self.log(f"Calling Directions API: {url}")
        try:
            response = requests.get(url)
            response.raise_for_status()
            directions = response.json()
            if directions.get('status') == 'OK':
                self.log(f"Directions API returned OK. Route contains {len(directions['routes'][0]['legs'])} legs.")
                return directions
            else:
                self.log(f"Directions API returned status: {directions.get('status')} - {directions.get('error_message')}" )
                if not silent:
                    # Show a message on the main thread
                    self.after(0, lambda: messagebox.showerror("Directions API Error", f"Could not find a route: {directions.get('error_message', directions.get('status'))}"))
                return None
        except requests.exceptions.RequestException as e:
            self.log(f"Directions API connection error: {e}")
            if not silent:
                self.after(0, lambda: messagebox.showerror("Connection Error", f"Failed to connect to Directions API: {e}"))
            return None

    def extend_route_iteratively(self, initial_pins, initial_directions, min_duration, max_duration):
        # 1. Find the longest leg of the initial route
        legs = initial_directions['routes'][0]['legs']
        longest_leg_index = max(range(len(legs)), key=lambda i: legs[i]['duration']['value'])

        start_leg = legs[longest_leg_index]['start_location']
        end_leg = legs[longest_leg_index]['end_location']
        midpoint_lat = (start_leg['lat'] + end_leg['lat']) / 2
        midpoint_lng = (start_leg['lng'] + end_leg['lng']) / 2

        # 2. Iteratively search for POIs in increasing radiuses
        best_candidate = None
        poi_types = "park|tourist_attraction|cafe|library"

        for radius in [500, 1000, 2000, 4000]: # Search radiuses in meters
            self.log(f"Searching Places API at radius {radius}m around midpoint {midpoint_lat:.5f},{midpoint_lng:.5f}")
            places_url = f"https://maps.googleapis.com/maps/api/place/nearbysearch/json?location={midpoint_lat},{midpoint_lng}&radius={radius}&type={poi_types}&rankby=prominence&key={self.api_key}"

            try:
                response = requests.get(places_url)
                response.raise_for_status()
                places = response.json()

                if places.get('status') == 'OK':
                    results = places.get('results', [])
                    self.log(f"Places API returned {len(results)} candidates for radius {radius}m")
                    for idx, place in enumerate(results, start=1):
                        poi_loc = place['geometry']['location']
                        poi_pin = {'lat': poi_loc['lat'], 'lng': poi_loc['lng'], 'address': place.get('name')}

                        self.log(f"Testing POI {idx}/{len(results)}: {poi_pin['address']} at {poi_pin['lat']:.5f},{poi_pin['lng']:.5f}")

                        test_pins = initial_pins[:]
                        test_pins.insert(longest_leg_index + 1, poi_pin)

                        test_directions = self.get_directions_for_pins(test_pins, silent=True)
                        if not test_directions:
                            self.log("Directions lookup for candidate failed or returned no route; skipping")
                            continue

                        test_duration = self.get_route_duration(test_directions)
                        self.log(f"Candidate route duration: {test_duration:.1f} minutes")
                        if min_duration <= test_duration <= max_duration:
                            candidate = {
                                'pins': test_pins,
                                'directions': test_directions,
                                'duration': test_duration,
                                'diff': abs(test_duration - min_duration) # How close is it?
                            }
                            if best_candidate is None or candidate['diff'] < best_candidate['diff']:
                                best_candidate = candidate
                                self.log(f"Found a new best candidate (diff {best_candidate['diff']:.1f} mins)")

            except requests.exceptions.RequestException as e:
                self.log(f"Places API request failed for radius {radius}m: {e}. Continuing to next radius.")
                continue # Ignore failures and try next radius

        return best_candidate # This will be None or the best route found

    def get_route_duration(self, directions):
        if not directions: return 0
        return sum(leg['duration']['value'] for leg in directions['routes'][0]['legs']) / 60

    def display_final_duration(self, directions, target_duration_minutes):
        total_duration_minutes = self.get_route_duration(directions)
        message = f"The calculated route takes approximately {total_duration_minutes:.0f} minutes."
        if total_duration_minutes < target_duration_minutes:
            message += f"\n\nThis is shorter than your {target_duration_minutes} minute goal. The app could not find a suitable detour to extend it further."
        elif total_duration_minutes > target_duration_minutes * 1.1:
             message += f"\n\nThis is a bit longer than your goal, but it was the best option found."
        messagebox.showinfo("Route Calculated", message)

    # --- Other methods (add_pin, remove_pin, draw_route, etc.) ---
    # These methods are unchanged from the previous version.
    def search_location(self, event=None):
        location = self.address_entry.get()
        if not location: return
        geocode_url = f"https://maps.googleapis.com/maps/api/geocode/json?address={location}&key={self.api_key}"
        self.log(f"Calling Geocoding API for '{location}'")
        try:
            response = requests.get(geocode_url)
            response.raise_for_status()
            results = response.json().get('results', [])
            if results:
                geom = results[0]['geometry']['location']
                self.map_widget.set_position(geom['lat'], geom['lng'])
                self.map_widget.set_zoom(15)
                self.add_pin(geom['lat'], geom['lng'], results[0]['formatted_address'])
            else:
                messagebox.showerror("Error", "Location not found.")
        except requests.exceptions.RequestException as e:
            messagebox.showerror("Error", f"Failed to connect to Geocoding API: {e}")

    def add_pin_from_map(self, coords):
        lat, lng = coords
        rev_geocode_url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lng}&key={self.api_key}"
        address = f"Lat: {lat:.5f}, Lng: {lng:.5f}"
        self.log(f"Reverse geocoding pin at {lat:.5f},{lng:.5f}")
        try:
            response = requests.get(rev_geocode_url)
            response.raise_for_status()
            results = response.json().get('results', [])
            if results:
                address = results[0]['formatted_address']
        except requests.exceptions.RequestException:
            pass
        self.add_pin(lat, lng, address)

    def add_pin(self, lat, lng, address):
        self.pins.append({'lat': lat, 'lng': lng, 'address': address})
        marker = self.map_widget.set_marker(lat, lng, text=f"Pin {len(self.pins)}")
        self.markers.append(marker)
        self.update_pins_listbox()
        self.clear_route()
        self.log(f"Added pin #{len(self.pins)}: {address} at {lat:.5f},{lng:.5f}")

    def remove_last_pin(self):
        if self.pins:
            self.pins.pop()
            if self.markers: self.markers.pop().delete()
            self.update_pins_listbox()
            self.clear_route()

    def update_pins_listbox(self):
        self.pins_listbox.delete(0, tk.END)
        for i, pin in enumerate(self.pins):
            self.pins_listbox.insert(tk.END, f"Pin {i+1}: {pin['address']}")

    def draw_route(self, directions):
        if self.route_path: self.route_path.delete()
        route_points = []
        for leg in directions['routes'][0]['legs']:
            for step in leg['steps']:
                route_points.extend(self.decode_polyline(step['polyline']['points']))
        if route_points:
            self.route_path = self.map_widget.set_path(route_points)

    def clear_route(self):
        if self.route_path: self.route_path.delete()
        self.route_path = None
        self.share_button.config(state=tk.DISABLED)
        self.last_route_info = None
        # stop progress if running
        try:
            self.progress.stop()
        except Exception:
            pass

    def share_route(self):
        if not self.last_route_info:
            messagebox.showerror("Error", "No route to share. Please calculate a route first.")
            return
        pins_for_url = self.last_route_info['pins']
        if not pins_for_url: return
        base_url = "https://www.google.com/maps/dir/?api=1"
        origin_url = f"&origin={pins_for_url[0]['lat']},{pins_for_url[0]['lng']}"
        destination_url = f"&destination={pins_for_url[0]['lat']},{pins_for_url[0]['lng']}"
        waypoints_list = [f"{p['lat']},{p['lng']}" for p in pins_for_url[1:]]
        waypoints_url = "&waypoints=" + "|".join(waypoints_list) if waypoints_list else ""
        travelmode_url = "&travelmode=walking"
        final_url = f"{base_url}{origin_url}{destination_url}{waypoints_url}{travelmode_url}"
        pyperclip.copy(final_url)
        messagebox.showinfo("Link Copied", "Google Maps route link has been copied to your clipboard.")

    def decode_polyline(self, polyline_str):
        index, lat, lng, coordinates = 0, 0, 0, []
        while index < len(polyline_str):
            for i, change_type in enumerate(['latitude', 'longitude']):
                shift, result = 0, 0
                while True:
                    byte = ord(polyline_str[index]) - 63
                    index += 1
                    result |= (byte & 0x1f) << shift
                    shift += 5
                    if not byte >= 0x20: break
                change = (~(result >> 1) if result & 1 else (result >> 1))
                if i == 0: lat += change
                else: lng += change
            coordinates.append((lat / 100000.0, lng / 100000.0))
        return coordinates

    # --- Logging helpers and background worker ---
    def log(self, message: str):
        timestamp = time.strftime('%H:%M:%S')
        self.log_queue.put(f"[{timestamp}] {message}")

    def clear_log(self):
        self.log_widget.config(state='normal')
        self.log_widget.delete('1.0', tk.END)
        self.log_widget.config(state='disabled')

    def _process_log_queue(self):
        """Called in the main thread via after() to flush queued log messages into the text widget."""
        flushed = False
        try:
            while True:
                msg = self.log_queue.get_nowait()
                self.log_widget.config(state='normal')
                self.log_widget.insert(tk.END, msg + '\n')
                self.log_widget.see(tk.END)
                self.log_widget.config(state='disabled')
                flushed = True
        except queue.Empty:
            pass
        # keep polling
        self.after(100, self._process_log_queue)

    def _calculate_route_thread(self, target_duration_minutes: int):
        """Background thread target which performs the route calculation and then schedules UI updates."""
        try:
            max_duration_minutes = target_duration_minutes * 1.25 + 10
            route_pins = self.pins[:]
            self.log("Calculating initial direct route...")
            directions = self.get_directions_for_pins(route_pins)

            if not directions:
                self.log("Initial directions lookup failed. Aborting calculation.")
                self.after(0, lambda: self.progress.stop())
                return

            initial_duration_minutes = self.get_route_duration(directions)
            if initial_duration_minutes < target_duration_minutes:
                self.log(f"Direct route is {initial_duration_minutes:.0f} mins; searching for detours to reach {target_duration_minutes} mins...")
                best_extended_route = self.extend_route_iteratively(route_pins, directions, target_duration_minutes, max_duration_minutes)
                if best_extended_route:
                    route_pins = best_extended_route['pins']
                    directions = best_extended_route['directions']
                    self.log(f"Extended route found: {best_extended_route['duration']:.1f} minutes")
                else:
                    self.log("Could not find a suitable detour; using direct route.")

            # Schedule UI updates on main thread
            def _finalize():
                self.last_route_info = {'directions': directions, 'pins': route_pins}
                self.draw_route(directions)
                self.display_final_duration(directions, target_duration_minutes)
                self.share_button.config(state=tk.NORMAL)
                self.progress.stop()

            self.after(0, _finalize)

        except Exception as e:
            self.log(f"Unexpected error during route calculation: {e}")
            self.after(0, lambda: messagebox.showerror("Error", f"An unexpected error occurred: {e}"))
            self.after(0, lambda: self.progress.stop())

if __name__ == "__main__":
    app = App()
    app.mainloop()
