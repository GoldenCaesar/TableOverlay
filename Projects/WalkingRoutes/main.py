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
        """
        Background thread target. Dispatches to the correct route generation
        logic based on the number of pins and then schedules UI updates.
        """
        try:
            initial_pins = self.pins[:]
            candidate_routes = []

            if len(initial_pins) == 1:
                self.log("Single pin detected. Generating loop route...")
                candidate_routes = self._generate_loop_route(initial_pins[0], target_duration_minutes)
            else:
                self.log(f"{len(initial_pins)} pins detected. Generating detour route...")
                candidate_routes = self._generate_detour_route(initial_pins, target_duration_minutes)

            if not candidate_routes:
                self.log("No candidate routes could be generated.")
                self.after(0, lambda: messagebox.showinfo("No Route Found", "Could not generate any valid routes. Please try a different location or duration."))
                self.after(0, lambda: self.progress.stop())
                return

            self.log(f"Scoring {len(candidate_routes)} candidate routes...")
            best_route = None
            best_score = float('inf')

            for i, route in enumerate(candidate_routes):
                self.log(f"Scoring candidate route #{i+1}...")
                score = self._calculate_route_score(route, target_duration_minutes)
                if score < best_score:
                    best_score = score
                    best_route = route
                    self.log(f"New best route found: Candidate #{i+1} with score {score:.1f}")

            if not best_route:
                 self.log("All candidate routes failed scoring.")
                 self.after(0, lambda: messagebox.showinfo("No Route Found", "Could not find a suitable route. All candidates were invalid or scored poorly."))
                 self.after(0, lambda: self.progress.stop())
                 return

            self.log(f"Selected best route with final score: {best_score:.1f}")

            # Schedule UI updates on main thread
            def _finalize():
                self.last_route_info = {'directions': best_route['directions'], 'pins': best_route['pins']}
                self.draw_route(best_route['directions'])
                self.display_final_duration(best_route['directions'], target_duration_minutes)
                self.share_button.config(state=tk.NORMAL)
                self.progress.stop()

            self.after(0, _finalize)

        except Exception as e:
            self.log(f"Unexpected error during route calculation: {e}")
            # Use after() to ensure messagebox is called from the main thread
            self.after(0, lambda: messagebox.showerror("Error", f"An unexpected error occurred: {e}"))
            self.after(0, lambda: self.progress.stop())

    def _generate_loop_route(self, start_pin, target_duration_minutes):
        """
        Generates candidate loop routes from a single starting point by creating
        geometric anchor points.
        """
        candidate_routes = []
        # Avg walking speed: ~3 mph or ~4.8 km/h. Let's use 4.5 km/h for calculation.
        # km = (minutes / 60) * 4.5
        # We are making a loop, so the farthest point is roughly at duration / 4
        # (e.g., 60 min walk, out 15m, across 30m, back 15m)
        # Radius in km for a quarter of the duration
        radius_km = (target_duration_minutes / 4 / 60) * 4.5

        # Convert radius from km to degrees of latitude/longitude
        # 1 degree of latitude is ~111.1 km. Longitude varies.
        lat_degree_per_km = 1 / 111.1
        lng_degree_per_km = 1 / (111.1 * math.cos(math.radians(start_pin['lat'])))
        radius_lat = radius_km * lat_degree_per_km
        radius_lng = radius_km * lng_degree_per_km
        self.log(f"Calculated walkable radius: {radius_km:.2f} km")

        # --- Generate Anchor Point Sets ---
        # Each anchor set is a list of dicts: {'lat': ..., 'lng': ...}
        anchor_sets = []
        # Set 1: Triangle
        anchor_sets.append([
            {'lat': start_pin['lat'] + radius_lat, 'lng': start_pin['lng']}, # North
            {'lat': start_pin['lat'] - radius_lat * 0.5, 'lng': start_pin['lng'] + radius_lng * 0.866}, # Southeast
            {'lat': start_pin['lat'] - radius_lat * 0.5, 'lng': start_pin['lng'] - radius_lng * 0.866}, # Southwest
        ])
        # Set 2: Square
        anchor_sets.append([
            {'lat': start_pin['lat'] + radius_lat, 'lng': start_pin['lng'] - radius_lng}, # Northwest
            {'lat': start_pin['lat'] + radius_lat, 'lng': start_pin['lng'] + radius_lng}, # Northeast
            {'lat': start_pin['lat'] - radius_lat, 'lng': start_pin['lng'] + radius_lng}, # Southeast
            {'lat': start_pin['lat'] - radius_lat, 'lng': start_pin['lng'] - radius_lng}, # Southwest
        ])
        # Set 3: A wider 'diamond' shape
        anchor_sets.append([
             {'lat': start_pin['lat'] + radius_lat * 0.7, 'lng': start_pin['lng']}, # North
             {'lat': start_pin['lat'], 'lng': start_pin['lng'] + radius_lng * 1.5},      # East
             {'lat': start_pin['lat'] - radius_lat * 0.7, 'lng': start_pin['lng']}, # South
             {'lat': start_pin['lat'], 'lng': start_pin['lng'] - radius_lng * 1.5},      # West
        ])

        # --- Generate Candidate Routes ---
        self.log(f"Generating routes for {len(anchor_sets)} geometric shapes...")
        for i, anchors in enumerate(anchor_sets):
            # Create the full list of waypoints for the API call
            # The route is Start -> A1 -> A2 -> ... -> Start
            route_pins = [start_pin] + anchors
            self.log(f"Shape {i+1}: Requesting route with {len(anchors)} anchors.")
            directions = self.get_directions_for_pins(route_pins, silent=True)
            if directions:
                duration = self.get_route_duration(directions)
                self.log(f"Shape {i+1}: Route generated, duration {duration:.1f} mins.")
                candidate_routes.append({
                    'directions': directions,
                    'pins': route_pins, # Store the pins including anchors
                    'duration': duration,
                })
            else:
                self.log(f"Shape {i+1}: Could not generate a route for this shape.")
        return candidate_routes


    def _generate_detour_route(self, initial_pins, target_duration_minutes):
        """
        Generates detour routes if the initial user-pinned route is shorter than
        the target duration.
        """
        candidate_routes = []
        self.log("Calculating direct route for comparison...")
        initial_directions = self.get_directions_for_pins(initial_pins, silent=True)
        if not initial_directions:
            self.log("Could not calculate the initial direct route.")
            return []

        initial_duration = self.get_route_duration(initial_directions)
        self.log(f"Initial route duration: {initial_duration:.1f} minutes.")
        # Add the original route as the first candidate
        candidate_routes.append({
            'directions': initial_directions,
            'pins': initial_pins,
            'duration': initial_duration,
        })

        # If the direct route is already long enough, no need for detours
        if initial_duration >= target_duration_minutes:
            self.log("Initial route is already long enough. No detours needed.")
        else:
            self.log(f"Initial route is shorter than target, generating detours...")
    def _check_for_traffic_lights(self, route_points):
        """
        Queries the OpenStreetMap Overpass API to find traffic signals along a route.
        """
        self.log("Checking route for traffic lights via Overpass API...")
        overpass_url = "https://overpass-api.de/api/interpreter"
        # Build a query that looks for traffic signals within a radius of each point in the route
        # Using a polyline is more efficient than querying every single point
        polyline = " ".join([f"{lat} {lng}" for lat, lng in route_points])
        query = f"""
        [out:json];
        (
          node(around:20, {polyline})["highway"="traffic_signals"];
        );
        out count;
        """
        try:
            response = requests.post(overpass_url, data={'data': query})
            response.raise_for_status()
            data = response.json()
            # The 'total' count is available in the 'counts' element
            count = int(data.get('elements', [{}])[0].get('tags', {}).get('total', 0))
            self.log(f"Overpass API found {count} traffic signals.")
            return count
        except requests.exceptions.RequestException as e:
            self.log(f"Overpass API request failed: {e}. Skipping traffic light check.")
            return 0 # Return 0 if the API fails, so we don't unfairly penalize a good route
        except (ValueError, IndexError, KeyError) as e:
            self.log(f"Could not parse Overpass API response: {e}. Skipping traffic light check.")
            return 0

            # --- Identify Longest Leg for Detour ---
            legs = initial_directions['routes'][0]['legs']
            # Note: The "legs" correspond to the segments between the waypoints provided
            # to the API. If we have Start, P1, P2, the legs are Start->P1, P1->P2, P2->Start.
            longest_leg_index = max(range(len(legs)), key=lambda i: legs[i]['duration']['value'])
            leg_to_detour = legs[longest_leg_index]
            self.log(f"Longest leg is #{longest_leg_index+1} (duration: {leg_to_detour['duration']['value']/60:.1f} mins).")

            # --- Generate Detour Anchors ---
            # Find the midpoint of the longest leg
            start_leg = leg_to_detour['start_location']
            end_leg = leg_to_detour['end_location']
            midpoint = {
                'lat': (start_leg['lat'] + end_leg['lat']) / 2,
                'lng': (start_leg['lng'] + end_leg['lng']) / 2
            }
            # Calculate a detour distance (similar to loop radius calculation)
            duration_to_add = target_duration_minutes - initial_duration
            # A detour adds roughly 2x its "radius" in time.
            detour_km = (duration_to_add / 2 / 60) * 4.5
            lat_degree_per_km = 1 / 111.1
            lng_degree_per_km = 1 / (111.1 * math.cos(math.radians(midpoint['lat'])))
            detour_lat = detour_km * lat_degree_per_km
            detour_lng = detour_km * lng_degree_per_km
            self.log(f"Calculated detour distance: {detour_km:.2f} km")

            # Create two anchor points, one on each side of the leg's midpoint
            # The direction of the "side" is perpendicular to the leg's direction
            leg_vec = {'lat': end_leg['lat'] - start_leg['lat'], 'lng': end_leg['lng'] - start_leg['lng']}
            perp_vec1 = {'lat': -leg_vec['lng'], 'lng': leg_vec['lat']} # Perpendicular vector
            perp_vec2 = {'lat': leg_vec['lng'], 'lng': -leg_vec['lat']} # Other side

            detour_anchors = []
            for vec in [perp_vec1, perp_vec2]:
                # Normalize the perpendicular vector
                vec_mag = math.sqrt(vec['lat']**2 + vec['lng']**2)
                if vec_mag == 0: continue
                norm_vec = {'lat': vec['lat']/vec_mag, 'lng': vec['lng']/vec_mag}
                # Create anchor by moving from midpoint along the normalized perpendicular vector
                detour_anchors.append({
                    'lat': midpoint['lat'] + norm_vec['lat'] * lat_degree_per_km * detour_km,
                    'lng': midpoint['lng'] + norm_vec['lng'] * lng_degree_per_km * detour_km,
                })

            # --- Generate and Test Detour Routes ---
            self.log(f"Generating routes for {len(detour_anchors)} detour anchors...")
            for i, anchor in enumerate(detour_anchors):
                # Insert the anchor into the pin list *after* the start of the longest leg
                test_pins = initial_pins[:]
                test_pins.insert(longest_leg_index + 1, anchor)
                self.log(f"Detour {i+1}: Requesting route with new anchor.")
                directions = self.get_directions_for_pins(test_pins, silent=True)
                if directions:
                    duration = self.get_route_duration(directions)
                    self.log(f"Detour {i+1}: Route generated, duration {duration:.1f} mins.")
                    candidate_routes.append({
                        'directions': directions,
                        'pins': test_pins,
                        'duration': duration,
                    })
                else:
                    self.log(f"Detour {i+1}: Could not generate a route for this anchor.")
        return candidate_routes

    def _calculate_route_score(self, route, target_duration_minutes):
        """
        Calculates a score for a given route based on duration, overlap, and road types.
        Lower score is better.
        """
        # --- 1. Duration Score ---
        # Penalize routes that are too far from the target duration.
        # We use a percentage difference to make it fair for short vs long walks.
        duration_diff = abs(route['duration'] - target_duration_minutes)
        duration_score = (duration_diff / target_duration_minutes) * 100 # Percentage difference as a score
        self.log(f"  - Duration score: {duration_score:.1f} (target: {target_duration_minutes}, actual: {route['duration']:.1f})")

        # --- 2. Overlap Score ---
        # Decode all polylines and count how many times each segment is used.
        # We round coordinates to a certain precision to catch segments that are
        # practically the same but have minor float differences.
        all_segments = []
        precision = 5 # 5 decimal places is ~1.1 meters. Good enough to catch same-road travel.
        for leg in route['directions']['routes'][0]['legs']:
            for step in leg['steps']:
                points = self.decode_polyline(step['polyline']['points'])
                # Create segments (pairs of coordinates) from the decoded points
                for i in range(len(points) - 1):
                    p1 = (round(points[i][0], precision), round(points[i][1], precision))
                    p2 = (round(points[i+1][0], precision), round(points[i+1][1], precision))
                    # Normalize segment direction by always having the smaller lat first
                    all_segments.append(tuple(sorted((p1, p2))))

        segment_counts = {}
        for segment in all_segments:
            segment_counts[segment] = segment_counts.get(segment, 0) + 1

        # Penalize heavily for each segment that is used more than once.
        overlap_penalty = 0
        overlapped_segment_count = 0
        for count in segment_counts.values():
            if count > 1:
                # The penalty increases exponentially with more overlaps on the same segment
                overlap_penalty += (count - 1) * 25 # e.g., used twice = 25 penalty, thrice = 50
                overlapped_segment_count += 1

        self.log(f"  - Overlap score: {overlap_penalty} ({overlapped_segment_count} overlapped segments)")

        # --- 3. Road Type Score (Traffic Light Penalty) ---
        traffic_light_penalty = 0
        if self.avoid_highways_var.get():
            # Only check for traffic lights if the user has toggled the option
            all_points = []
            for leg in route['directions']['routes'][0]['legs']:
                for step in leg['steps']:
                    all_points.extend(self.decode_polyline(step['polyline']['points']))

            traffic_light_count = self._check_for_traffic_lights(all_points)
            # Assign a very high penalty for each traffic light found
            traffic_light_penalty = traffic_light_count * 50
            self.log(f"  - Traffic Light score: {traffic_light_penalty} ({traffic_light_count} lights found)")
        else:
            self.log("  - Traffic Light score: 0 (check skipped by user)")

        # --- Final Score ---
        # Weights can be tuned. Let's make overlap and traffic lights very important.
        final_score = (duration_score * 1.5) + (overlap_penalty * 5.0) + traffic_light_penalty
        self.log(f"  - TOTAL SCORE (lower is better): {final_score:.1f}")
        return final_score

if __name__ == "__main__":
    app = App()
    app.mainloop()
