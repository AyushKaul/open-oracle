pragma solidity ^0.6.10;
pragma experimental ABIEncoderV2;

import "./OpenOraclePriceData.sol";
import "./Verifier.sol";
import "./Uniswap/UniswapLib.sol";

struct Observation {
    uint timestamp;
    uint acc;
}

contract OracleView {
    using FixedPoint for *;

    /// @notice The Open Oracle Price Data contract
    OpenOraclePriceData public immutable priceData;

    /// @notice The number of wei in 1 ETH
    uint public constant ethBaseUnit = 1e18;

    /// @notice A common scaling factor to maintain precision
    uint public constant expScale = 1e18;

    /// @notice The Open Oracle Reporter
    address public immutable reporter;

    /// @notice Official prices by symbol hash
    mapping(bytes32 => uint) public prices;

    /// @notice Circuit breaker for using anchor price oracle directly, ignoring reporter
    bool public reporterInvalidated;

    /// @notice The old observation for each symbolHash
    mapping(bytes32 => Observation) public oldObservations;

    /// @notice The new observation for each symbolHash
    mapping(bytes32 => Observation) public newObservations;

    /// @notice The event emitted when new prices are posted but the stored price is not updated due to the anchor
    event PriceGuarded(string symbol, uint reporter, uint anchor);

    /// @notice The event emitted when the stored price is updated
    event PriceUpdated(string symbol, uint price);

    /// @notice The event emitted when anchor price is updated
    event AnchorPriceUpdated(string symbol, uint anchorPrice, uint oldTimestamp, uint newTimestamp);

    /// @notice The event emitted when the uniswap window changes
    event UniswapWindowUpdated(bytes32 indexed symbolHash, uint oldTimestamp, uint newTimestamp, uint oldPrice, uint newPrice);

    /// @notice The event emitted when reporter invalidates itself
    event ReporterInvalidated(address reporter);

    bytes32 constant ethHash = keccak256(abi.encodePacked("ETH"));
    bytes32 constant rotateHash = keccak256(abi.encodePacked("rotate"));

    /**
     * @notice Construct a uniswap anchored view for a set of token configurations
     * @dev Note that to avoid immature TWAPs, the system must run for at least a single anchorPeriod before using.
     * @param reporter_ The reporter whose prices are to be used
     * @param priceData_ The address of the oracle data contract which is backing the view
     */
    constructor(OpenOraclePriceData priceData_,
                address reporter_) public {
        priceData = priceData_;
        reporter = reporter_;
    }

    /**
     * @notice Post open oracle reporter prices, and recalculate stored price by comparing to anchor
     * @dev We let anyone pay to post anything, but only prices from configured reporter will be stored in the view.
     * @param messages The messages to post to the oracle
     * @param signatures The signatures for the corresponding messages
     */
    function postPrices(bytes[] calldata messages,
        bytes[] calldata signatures,
        Proof[] calldata proofs,
        PublicInput[] calldata inputs) external {
            require(messages.length == signatures.length, "messages and signatures must be 1:1");

            // Save the prices
            for (uint i = 0; i < messages.length; i++) {
                priceData.put(messages[i], signatures[i], proofs[i], inputs[i]);
            }
    }

    /**
     * @notice Use priceData.getCSRange() directly
     * @param source The verifiable author of the data
     * @param key The selector for the value to return (symbol in case of uniswap)
     * @return Price range denominated in USD, with 6 decimals
     */
    function price(address source, string calldata key) external view returns (uint64, uint64) {
        uint64 min;
        uint64 max;
        (min, max) = priceData.getCSRange(source, key);
        return (min, max);
    }
}
