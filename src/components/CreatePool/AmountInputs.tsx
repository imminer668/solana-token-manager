import { 
    Box,
    VStack,
    Text,
    HStack,
    FormControl,
    FormLabel,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    NumberIncrementStepper,
    NumberDecrementStepper,
    InputGroup,
    InputRightElement,
    Divider,
    Badge
} from '@chakra-ui/react';

interface AmountInputsProps {
    baseAmount: string;
    quoteAmount: string;
    onBaseAmountChange: (value: string) => void;
    onQuoteAmountChange: (value: string) => void;
}

export const AmountInputs: React.FC<AmountInputsProps> = ({
    baseAmount,
    quoteAmount,
    onBaseAmountChange,
    onQuoteAmountChange
}) => {
    return (
        <Box 
            w="100%" 
            p={6} 
            borderWidth={1} 
            borderRadius="lg" 
            borderColor="purple.200"
            bg="white"
            boxShadow="sm"
        >
            <VStack spacing={4} align="start" w="100%">
                <HStack justify="space-between" w="100%">
                    <Text fontSize="xl" fontWeight="bold">创建流动性池</Text>
                    <Badge colorScheme="purple" fontSize="md" px={3} py={1} borderRadius="full">
                        第二步
                    </Badge>
                </HStack>

                <Divider />

                <Text fontSize="sm" color="gray.600">
                    请输入您想要添加到流动性池的代币数量。确保您的钱包中有足够的余额。
                </Text>

                <HStack w="100%" spacing={4} align="start">
                    <FormControl>
                        <FormLabel fontSize="sm" color="gray.700">代币数量</FormLabel>
                        <InputGroup size="lg">
                            <NumberInput
                                value={baseAmount}
                                onChange={onBaseAmountChange}
                                min={0}
                                precision={2}
                                w="100%"
                            >
                                <NumberInputField 
                                    borderColor="purple.200"
                                    _hover={{ borderColor: "purple.300" }}
                                    _focus={{ borderColor: "purple.500", boxShadow: "0 0 0 1px var(--chakra-colors-purple-500)" }}
                                />
                                <NumberInputStepper>
                                    <NumberIncrementStepper borderColor="purple.200" />
                                    <NumberDecrementStepper borderColor="purple.200" />
                                </NumberInputStepper>
                            </NumberInput>
                            <InputRightElement width="4.5rem" mr="1.5rem">
                                <Text fontSize="sm" color="gray.500">代币</Text>
                            </InputRightElement>
                        </InputGroup>
                    </FormControl>

                    <FormControl>
                        <FormLabel fontSize="sm" color="gray.700">SOL 数量</FormLabel>
                        <InputGroup size="lg">
                            <NumberInput
                                value={quoteAmount}
                                onChange={onQuoteAmountChange}
                                min={0}
                                precision={2}
                                w="100%"
                            >
                                <NumberInputField 
                                    borderColor="purple.200"
                                    _hover={{ borderColor: "purple.300" }}
                                    _focus={{ borderColor: "purple.500", boxShadow: "0 0 0 1px var(--chakra-colors-purple-500)" }}
                                />
                                <NumberInputStepper>
                                    <NumberIncrementStepper borderColor="purple.200" />
                                    <NumberDecrementStepper borderColor="purple.200" />
                                </NumberInputStepper>
                            </NumberInput>
                            <InputRightElement width="4.5rem" mr="1.5rem">
                                <Text fontSize="sm" color="gray.500">SOL</Text>
                            </InputRightElement>
                        </InputGroup>
                    </FormControl>
                </HStack>

                <Text fontSize="xs" color="gray.500" mt={2}>
                    注意：创建流动性池需要支付一定的交易费用
                </Text>
            </VStack>
        </Box>
    );
}; 