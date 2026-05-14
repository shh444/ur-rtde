from pymodbus.client import ModbusTcpClient

# UR controller exposes:
#   - 128~255 : General-purpose registers (holding, FC 03/06/16) — used by URScript
#               for the shipyard welding/pendant protocol.
#   - 258+    : Built-in status registers (input, FC 04) — robot mode, joint
#               angles, currents, TCP pose, safety flags.

WELDING_BLOCK_START = 128
WELDING_BLOCK_COUNT = 128  # 128..255 inclusive
STATUS_MODE_ADDR = 258
STATUS_ERROR_START = 260      # 260..265
STATUS_ERROR_COUNT = 6
STATUS_JOINT_ANGLE_START = 270  # 270..275 (mrad)
STATUS_JOINT_REV_START = 320    # 320..325 (1 or -1 as 0/65535)
STATUS_JOINT_CURRENT_START = 290  # 290..295
STATUS_TCP_START = 400         # 400..405

ROBOT_MODE_DESCRIPTIONS = {
    0: "Disconnected",
    1: "Confirm Safety",
    2: "Booting",
    3: "Power Off",
    4: "Power On",
    5: "Idle",
    6: "Backdrive",
    7: "Running",
}
ERROR_DESCRIPTIONS = [
    "isPowerOnRobot",
    "isSecurityStopped",
    "isEmergencyStopped",
    "isTeachButtonPressed",
    "isPowerButtonPressed",
    "isSafetySignalSuchThatWeShouldStop",
]


def _u16_to_signed(value: int) -> int:
    """Modbus registers are unsigned 16-bit; UR encodes signed as two's complement."""
    return value - 65536 if value > 32767 else value


class UniversalRobotsModbus:
    #Robot IP
    def __init__(self, address, port: int = 502, verbose: bool = True):
        self.Ip_address = address
        self.Server_port = port
        self.verbose = verbose
        # pymodbus 3.6+ 에서 port가 keyword-only 로 바뀜. 모든 3.x 호환되게 host=, port= 사용.
        self.client = ModbusTcpClient(host=self.Ip_address, port=self.Server_port)
        self.reset_values()
        if self.connect():
            self._log("Modbus/TCP client connected.")
        else:
            self._log("Failed to connect to Modbus/TCP server.")

    def _log(self, *args):
        if self.verbose:
            print(*args)

    def connect(self):
        return self.client.connect()

    def reset_values(self):
        self.angles_in_degrees =[]
        self.tcp_values = []
        self.current_values = []
        self.mode_description = ""
        self.error_info = {}

    def read_error_information(self):
        # List of Modbus addresses for error-related information
        error_addresses = {
            "isPowerOnRobot": 260,
            "isSecurityStopped": 261,
            "isEmergencyStopped": 262,
            "isTeachButtonPressed": 263,
            "isPowerButtonPressed": 264,
            "isSafetySignalSuchThatWeShouldStop": 265
        }

        self.error_info = {}

        if self.connect():
            # Read each error-related register and store results with descriptive keys
            for description, address in error_addresses.items():
                response = self.client.read_input_registers(address, count=1)
                if response.isError():
                    print(f"Error reading {description}: {response}")
                    self.error_info[description] = None
                else:
                    # Modbus typically returns 0 for false and 1 for true
                    self.error_info[description] = bool(response.registers[0])

            print("Error-related information:", self.error_info)
            return self.error_info
        else:
            print("Failed to connect to retrieve error-related information.")
            return None


    def read_robot_mode(self):
        UR_Mode = [258, 1]  # Modbus address for robot mode

        mode_descriptions = {
            0: "Disconnected",
            1: "Confirm Safety",
            2: "Booting",
            3: "Power Off",
            4: "Power On",
            5: "Idle",
            6: "Backdrive",
            7: "Running"
        }

        if self.connect():
            response = self.client.read_input_registers(UR_Mode[0], count=UR_Mode[1])
            if response.isError():
                print("Error reading robot mode:", response)
                return None
            else:
                mode_value = response.registers[0]
                self.mode_description = mode_descriptions.get(mode_value, "Unknown Mode")
                print("Robot Mode:", self.mode_description)
                return self.mode_description
        else:
            print("Failed to connect to retrieve robot mode.")
            return None

    def read_current_value(self):
        UR_Joint_current = [290, 6]  # Electric current values for each joint

        if self.connect():
            response = self.client.read_input_registers(UR_Joint_current[0], count=UR_Joint_current[1])
            if response.isError():
                print("Error reading current values:", response)
                return None
            else:
                # Adjust values if greater than 32768
                self.current_values = [(value - 65535)/1000 if value > 32768 else value/1000 for value in response.registers]
                print("current values:", self.current_values)
                return self.current_values
        else:
            print("Failed to connect to retrieve current values.")
            return None

    def read_tcp_value(self):
        UR_TCP = [400, 6]  # TCP values in the base coordinate system

        if self.connect():
            response = self.client.read_input_registers(UR_TCP[0], count=UR_TCP[1])
            if response.isError():
                print("Error reading TCP values:", response)
                return None
            else:

                self.tcp_values = [value - 65535 if value > 32768 else value for value in response.registers]
                self.tcp_values = [
                    self.tcp_values[i] / 10 if i < 3 else self.tcp_values[i] / 1000 for i in range(6)
                ]
                print("TCP values:", self.tcp_values)
                return self.tcp_values
        else:
            print("Failed to connect to retrieve TCP values.")
            return None

    def read_joint_angles(self):
        # Modbus addresses for joint angles
        UR_Joint_angle = [270, 6]  # mrad
        UR_Joint_angle_rev = [320,6] # 1 or -1
        if self.connect():
            response_angles = self.client.read_input_registers(UR_Joint_angle[0], count=UR_Joint_angle[1])
            response_revs = self.client.read_input_registers(UR_Joint_angle_rev[0], count=UR_Joint_angle_rev[1])
            if response_angles.isError():
                print("Error reading joint angles:", response_angles)
                return None
            elif response_revs.isError():
                print("Error reading joint angle reversals:", response_revs)
                return None
            else:
                angles = response_angles.registers
                reversals = response_revs.registers
                self.angles_in_degrees = []

                # Convert milliradians to degrees and apply reversal if necessary
                for angle, rev in zip(angles, reversals):
                    angle_deg = angle * 0.0573  # Conversion from mrad to degrees
                    if rev == 65535:  # Check if reversal is needed
                        angle_deg -= 360
                    self.angles_in_degrees.append(angle_deg)

                print("Joint angles in degrees:", self.angles_in_degrees)
                return self.angles_in_degrees
        else:
            print("Failed to connect to retrieve joint angles.")
            return None

    def read_welding_registers(self, start: int = WELDING_BLOCK_START,
                                count: int = WELDING_BLOCK_COUNT) -> dict | None:
        """Read the GP register block 128..255 (used by the shipyard pendant
        protocol). pymodbus caps a single FC03 read at 125 registers, so we
        split into two reads when count > 125."""
        if not self.connect():
            self._log("Failed to connect to read welding registers.")
            return None
        out: dict = {}
        remaining = count
        cursor = start
        while remaining > 0:
            chunk = min(remaining, 125)
            response = self.client.read_holding_registers(cursor, count=chunk)
            if response.isError():
                self._log(f"Error reading welding registers {cursor}+{chunk}: {response}")
                return None
            for i, raw in enumerate(response.registers):
                out[cursor + i] = raw
            cursor += chunk
            remaining -= chunk
        return out

    def read_status_block(self) -> dict | None:
        """Single-shot read of UR built-in status: robot mode, safety flags,
        joint angles, joint currents, TCP pose."""
        if not self.connect():
            self._log("Failed to connect to read status block.")
            return None

        snapshot: dict = {}

        rm = self.client.read_input_registers(STATUS_MODE_ADDR, count=1)
        if not rm.isError():
            mode_value = rm.registers[0]
            snapshot["robot_mode"] = mode_value
            snapshot["robot_mode_text"] = ROBOT_MODE_DESCRIPTIONS.get(mode_value, "Unknown")

        err = self.client.read_input_registers(STATUS_ERROR_START, count=STATUS_ERROR_COUNT)
        if not err.isError():
            snapshot["error_info"] = {
                ERROR_DESCRIPTIONS[i]: bool(err.registers[i])
                for i in range(STATUS_ERROR_COUNT)
            }

        ang = self.client.read_input_registers(STATUS_JOINT_ANGLE_START, count=6)
        rev = self.client.read_input_registers(STATUS_JOINT_REV_START, count=6)
        if not ang.isError() and not rev.isError():
            angles = []
            for a, r in zip(ang.registers, rev.registers):
                deg = a * 0.0573
                if r == 65535:
                    deg -= 360
                angles.append(round(deg, 3))
            snapshot["joint_angles_deg"] = angles

        cur = self.client.read_input_registers(STATUS_JOINT_CURRENT_START, count=6)
        if not cur.isError():
            snapshot["joint_currents_a"] = [
                round(_u16_to_signed(v) / 1000.0, 3) for v in cur.registers
            ]

        tcp = self.client.read_input_registers(STATUS_TCP_START, count=6)
        if not tcp.isError():
            raw = [_u16_to_signed(v) for v in tcp.registers]
            # X/Y/Z in 0.1mm, Rx/Ry/Rz in mrad per ur_modbus convention
            snapshot["tcp_pose"] = [
                round(raw[0] / 10.0, 3),
                round(raw[1] / 10.0, 3),
                round(raw[2] / 10.0, 3),
                round(raw[3] / 1000.0, 4),
                round(raw[4] / 1000.0, 4),
                round(raw[5] / 1000.0, 4),
            ]
        return snapshot

    def snapshot(self) -> dict:
        """Combined snapshot: welding GP block + UR status. Either field may be
        missing on read error; callers should handle gracefully."""
        result: dict = {"connected": self.connect()}
        if not result["connected"]:
            return result
        welding = self.read_welding_registers()
        status = self.read_status_block() or {}
        if welding is None:
            welding = {}
        # UR 빌트인 status 값들을 welding dict 의 빈 영역에 mirror.
        # 프론트엔드가 단일 channel(welding[addr])로 모든 레지스터를 동일하게 처리할 수 있게.
        # 주소 256+ 영역은 UR 표준 status (input registers).
        if "robot_mode" in status:
            welding[258] = status["robot_mode"]
        result["welding"] = welding
        result["status"] = status
        return result

    def close(self):
        self.client.close()
        self._log("Modbus/TCP client connection closed.")


# Example of how to use the class
if __name__ == "__main__":
    ur_modbus = UniversalRobotsModbus("192.168.13.129")
    ur_modbus.read_joint_angles()
    ur_modbus.read_tcp_value()
    ur_modbus.read_current_value()
    ur_modbus.read_robot_mode()
    ur_modbus.read_error_information()
    ur_modbus.close()
